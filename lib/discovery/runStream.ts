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

  return {
    stream: stream.id,
    category: stream.category_id,
    found: discoveryResults.asinList.length,
    asins: discoveryResults.asinList,
    totalResults: discoveryResults.totalResults,
    tokensLeft: discoveryResults.tokensLeft,
  };
}
