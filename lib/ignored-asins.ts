import { createClient } from "@/lib/supabase/server";

export async function getIgnoredAsins(): Promise<Set<string>> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("ignored_asins").select("asin");

  if (error || !data) {
    return new Set();
  }

  return new Set(
    data.map((row) =>
      String(row.asin || "")
        .trim()
        .toUpperCase(),
    ),
  );
}
