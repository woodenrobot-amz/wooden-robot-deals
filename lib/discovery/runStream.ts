import { createClient } from "@/lib/supabase/server";
import { runKeepaDiscovery } from "@/lib/keepa/discovery";

export async function runStream(streamName: string) {
  const supabase = await createClient();

  const { data: stream, error } = await supabase
    .from("discovery_streams")
    .select("*")
    .eq("id", streamName)
    .single();

  if (error || !stream) {
    throw new Error(`Stream not found: ${streamName}`);
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
  };
}
