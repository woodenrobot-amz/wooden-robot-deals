import { createAdminClient } from "@/lib/supabase/admin";
import { runKeepaDiscovery } from "@/lib/keepa/discovery";

export async function runStream(streamName: string) {
  const supabase = createAdminClient();

  const streamAliases: Record<string, string[]> = {
    three_d_printing: ["three_d_printing", "3d_printing"],
  };
  const candidateIds = streamAliases[streamName] || [streamName];

  const { data: streams, error } = await supabase
    .from("discovery_streams")
    .select("*")
    .in("id", candidateIds);

  if (error) {
    throw new Error(`Failed to load stream ${streamName}: ${error.message}`);
  }

  const stream =
    streams?.find((candidate) => candidate.id === streamName) || streams?.[0];

  if (!stream) {
    throw new Error(
      `Stream not found: ${streamName}. Checked: ${candidateIds.join(", ")}.`,
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
