// lib/brandTiers.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type BrandTier = {
  name: string;
  normalized_name: string;
  tier: string;
  score_bonus: number;
  aliases: string[] | null;
};

export async function getBrandTierMap() {
  const { data, error } = await supabase
    .from("brand_tiers")
    .select("name, normalized_name, tier, score_bonus, aliases");

  if (error) throw error;

  const map = new Map<string, BrandTier>();

  for (const brand of data || []) {
    map.set(brand.normalized_name, brand);

    for (const alias of brand.aliases || []) {
      map.set(alias.trim().toLowerCase(), brand);
    }
  }

  return map;
}

export function normalizeBrandName(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
