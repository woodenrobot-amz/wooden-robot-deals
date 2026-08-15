import { createAdminClient } from "@/lib/supabase/admin";
import { runKeepaDiscovery } from "@/lib/keepa/discovery";

const LOOKUP_BATCH_SIZE = 200;
const DEFER_DAYS = 7;

type ExistingCandidate = {
  asin: string;
  status: string;
  raw_data: Record<string, unknown> | null;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function suppressionEndsAt(candidate: ExistingCandidate) {
  const rawData = toRecord(candidate.raw_data);
  const review = toRecord(rawData.review);
  const pipeline = toRecord(rawData.pipeline);
  const explicit = Date.parse(String(review.suppressed_until || ""));

  if (Number.isFinite(explicit)) return explicit;

  // Legacy rejections did not store a deadline. Treat them as a seven-day
  // deferral from their review time so old decisions do not immediately recur.
  const reviewedAt = Date.parse(String(pipeline.reviewed_at || ""));
  return Number.isFinite(reviewedAt)
    ? reviewedAt + DEFER_DAYS * 24 * 60 * 60 * 1000
    : 0;
}

function normalizeStreamIdentifier(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/three/g, "3")
    .replace(/[^a-z0-9]/g, "");
}

export async function runStream(streamName: string) {
  const supabase = createAdminClient();

  const { data: streams, error } = await supabase
    .from("discovery_streams")
    .select("*");

  if (error) {
    throw new Error(`Failed to load discovery streams: ${error.message}`);
  }

  const requested = normalizeStreamIdentifier(streamName);
  const stream =
    streams?.find((candidate) => candidate.id === streamName) ||
    streams?.find(
      (candidate) =>
        normalizeStreamIdentifier(candidate.id) === requested ||
        normalizeStreamIdentifier(candidate.category_id) === requested,
    );

  if (!stream) {
    const available = (streams || [])
      .map((candidate) => String(candidate.id))
      .sort()
      .join(", ");
    throw new Error(
      `Stream not found: ${streamName}. Configured stream IDs: ${available || "none"}.`,
    );
  }

  if (!stream.is_active) {
    throw new Error(`${streamName} is inactive.`);
  }

  const discoveryResults = await runKeepaDiscovery(stream.config);

  const asins: string[] = discoveryResults.asinList.map((asin: string) =>
    asin.trim().toUpperCase(),
  );
  const existingCandidates: ExistingCandidate[] = [];
  const ignoredAsins = new Set<string>();
  const liveAsins = new Set<string>();

  for (const asinBatch of chunk(asins, LOOKUP_BATCH_SIZE)) {
    const [existingResult, ignoredResult, liveResult] = await Promise.all([
      supabase
        .from("deal_candidates")
        .select("asin, status, raw_data")
        .eq("stream_id", stream.id)
        .in("asin", asinBatch),
      supabase.from("ignored_asins").select("asin").in("asin", asinBatch),
      supabase
        .from("deals")
        .select("asin")
        .in("asin", asinBatch)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString()),
    ]);

    if (existingResult.error) {
      throw new Error(
        `Failed to load existing candidates: ${existingResult.error.message}`,
      );
    }
    if (ignoredResult.error) {
      throw new Error(`Failed to load ignored ASINs: ${ignoredResult.error.message}`);
    }
    if (liveResult.error) {
      throw new Error(`Failed to load live deals: ${liveResult.error.message}`);
    }

    existingCandidates.push(
      ...((existingResult.data || []) as ExistingCandidate[]),
    );
    for (const row of ignoredResult.data || []) {
      ignoredAsins.add(String(row.asin).toUpperCase());
    }
    for (const row of liveResult.data || []) {
      liveAsins.add(String(row.asin).toUpperCase());
    }
  }

  const existingByAsin = new Map(
    existingCandidates.map((candidate) => [candidate.asin.toUpperCase(), candidate]),
  );
  const discoveredAt = new Date().toISOString();
  let queued = 0;
  let preserved = 0;

  const candidateRows = asins.map((asin) => {
    const existing = existingByAsin.get(asin);
    const rawData = toRecord(existing?.raw_data);
    let status = "candidate";

    if (ignoredAsins.has(asin) || existing?.status === "ignored") {
      status = "ignored";
      preserved += 1;
    } else if (liveAsins.has(asin)) {
      status = "published";
      preserved += 1;
    } else if (existing?.status === "enriched") {
      status = "enriched";
      preserved += 1;
    } else if (
      existing?.status === "rejected" &&
      suppressionEndsAt(existing) > Date.now()
    ) {
      status = "rejected";
      preserved += 1;
    } else {
      queued += 1;
    }

    return {
      asin,
      source: "keepa",
      category_id: stream.category_id,
      stream_id: stream.id,
      status,
      raw_data: {
        ...rawData,
        discovered_from: stream.id,
        discovered_at: discoveredAt,
      },
    };
  });

  if (candidateRows.length > 0) {
    const { error: insertError } = await supabase
      .from("deal_candidates")
      .upsert(candidateRows, {
        onConflict: "asin,stream_id",
        ignoreDuplicates: false,
      });

    if (insertError) {
      throw new Error(`Failed to insert candidates: ${insertError.message}`);
    }
  }

  return {
    stream: stream.id,
    category: stream.category_id,
    found: discoveryResults.asinList.length,
    processed: candidateRows.length,
    queued,
    preserved,
    asins: discoveryResults.asinList,
    totalResults: discoveryResults.totalResults,
    tokensLeft: discoveryResults.tokensLeft,
    tokensConsumed: discoveryResults.tokensConsumed,
  };
}
