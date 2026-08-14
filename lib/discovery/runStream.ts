import { createAdminClient } from "@/lib/supabase/admin";
import { runKeepaDiscovery } from "@/lib/keepa/discovery";

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

  const candidateRows = discoveryResults.asinList.map((asin: string) => ({
    asin,
    source: "keepa",
    category_id: stream.category_id,
    stream_id: stream.id,
    status: "candidate",
    raw_data: {
      discovered_from: stream.id,
      discovered_at: new Date().toISOString(),
    },
  }));

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
    asins: discoveryResults.asinList,
    totalResults: discoveryResults.totalResults,
    tokensLeft: discoveryResults.tokensLeft,
    tokensConsumed: discoveryResults.tokensConsumed,
  };
}
