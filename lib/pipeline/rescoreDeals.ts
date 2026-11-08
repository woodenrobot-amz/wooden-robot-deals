import "server-only";

import { getBrandTierMap, normalizeBrandName } from "@/lib/brandTiers";
import { scoreDeal } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 250;
const SCORE_BADGES = ["Top Brand", "Huge Discount", "All Time Low"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function rescoreDeals() {
  const admin = createAdminClient();
  const tiers = await getBrandTierMap();
  const now = new Date().toISOString();
  const counts = { queue: 0, live: 0, skipped: 0 };

  function scoringFields(deal: Record<string, unknown>) {
    const tier = tiers.get(normalizeBrandName(String(deal.brand ?? "")));
    const scoring = scoreDeal({
      currentPrice: Number(deal.current_price) || null,
      avg90Price: Number(deal.avg_90_price) || null,
      brandTier: tier?.tier,
      brandBonus: tier?.score_bonus,
    });
    const previous = record(deal.scoring_components);
    const badges = Array.isArray(deal.badges) ? deal.badges : [];
    const nextBadges = [...badges.filter((badge) => !SCORE_BADGES.includes(badge)), ...scoring.badges];
    return {
      deal_score: scoring.totalScore,
      scoring_components: { ...previous, ...scoring.components },
      badges: nextBadges,
      brand_tier: tier?.tier ?? "unrated",
      brand_bonus: scoring.components.brandScore,
      changed: Object.entries(scoring.components).some(([key, value]) => previous[key] !== value) ||
        badges.length !== nextBadges.length || badges.some((badge) => !nextBadges.includes(badge)),
    };
  }

  async function rescoreQueue() {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from("deal_candidates")
        .select("id,status,raw_data")
        .in("status", ["enriched", "published"])
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;

      for (const candidate of data) {
        const raw = record(candidate.raw_data);
        if (!raw.enrichment) continue;
        const enrichment = record(raw.enrichment);
        const { changed, ...fields } = scoringFields(enrichment);
        if (!changed && enrichment.deal_score === fields.deal_score &&
          enrichment.brand_tier === fields.brand_tier && enrichment.brand_bonus === fields.brand_bonus) continue;

        const { data: updated, error: writeError } = await admin.from("deal_candidates")
          .update({ raw_data: { ...raw, enrichment: { ...enrichment, ...fields } } })
          .eq("id", candidate.id)
          .eq("status", candidate.status)
          .eq("raw_data", JSON.stringify(candidate.raw_data))
          .select("id").maybeSingle();
        if (writeError) throw writeError;
        if (updated) counts.queue++;
        else counts.skipped++;
      }
      if (data.length < PAGE_SIZE) return;
    }
  }

  async function rescoreLive() {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from("deals")
        .select("id,brand,current_price,avg_90_price,deal_score,scoring_components,badges,expires_at")
        .eq("status", "active").gt("expires_at", now)
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;

      for (const deal of data) {
        const { changed, deal_score, scoring_components, badges } = scoringFields(deal);
        if (!changed && deal.deal_score === (deal_score ?? 0)) continue;

        const { data: updated, error: writeError } = await admin.from("deals")
          .update({ deal_score: deal_score ?? 0, scoring_components, badges })
          .eq("id", deal.id)
          .eq("status", "active")
          .eq("expires_at", deal.expires_at)
          .filter("current_price", deal.current_price == null ? "is" : "eq", deal.current_price)
          .filter("avg_90_price", deal.avg_90_price == null ? "is" : "eq", deal.avg_90_price)
          .filter("scoring_components", deal.scoring_components == null ? "is" : "eq", JSON.stringify(deal.scoring_components))
          .select("id").maybeSingle();
        if (writeError) throw writeError;
        if (updated) counts.live++;
        else counts.skipped++;
      }
      if (data.length < PAGE_SIZE) return;
    }
  }

  const results = await Promise.allSettled([rescoreQueue(), rescoreLive()]);
  for (const result of results) {
    if (result.status === "rejected") console.error("Deal rescore failed:", result.reason);
  }
  return { ...counts, incomplete: results.some((result) => result.status === "rejected") };
}
