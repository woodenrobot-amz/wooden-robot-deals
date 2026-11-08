import "server-only";

import { getAmazonItems, type AmazonPublicItem } from "@/lib/amazon-creators";
import { FEED_DEAL_LIFETIME_MS, FEED_HUB_SOURCE, PUBLIC_DEAL_LIMIT } from "@/lib/public-feed";
import { scoreDeal } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";

const AMAZON_BATCH_SIZE = 10;
const AMAZON_BATCH_DELAY_MS = 1_100;
const MATERIAL_PRICE_INCREASE_PERCENT = 0.03;
const MATERIAL_PRICE_INCREASE_DOLLARS = 1;

type Deal = {
  id: string;
  asin: string;
  title: string;
  image_url: string | null;
  amazon_url: string | null;
  current_price: number | null;
  avg_90_price: number | null;
  deal_score: number;
  scoring_components: Record<string, unknown> | null;
  badges: string[] | null;
  expires_at: string;
  source: string | null;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isExplicitlyUnavailable(availability: string | null) {
  return Boolean(
    availability &&
      /(currently unavailable|unavailable|out of stock|not available)/i.test(
        availability,
      ),
  );
}

function lifecycleComponents(
  deal: Deal,
  checkedAt: string,
  outcome: string,
  reason: string | null = null,
) {
  return {
    ...toRecord(deal.scoring_components),
    lifecycle: {
      checkedAt,
      outcome,
      reason,
    },
  };
}

async function getAmazonItemsInBatches(asins: string[]) {
  const items: AmazonPublicItem[] = [];
  const failedAsins = new Set<string>();
  const errors: string[] = [];

  for (let index = 0; index < asins.length; index += AMAZON_BATCH_SIZE) {
    if (index > 0) await wait(AMAZON_BATCH_DELAY_MS);

    const batch = asins.slice(index, index + AMAZON_BATCH_SIZE);

    try {
      items.push(...(await getAmazonItems(batch)));
    } catch (error) {
      batch.forEach((asin) => failedAsins.add(asin));
      errors.push(error instanceof Error ? error.message : "Unknown Amazon error");
    }
  }

  return { items, failedAsins, errors };
}

export async function refreshLiveDeals() {
  const supabase = createAdminClient();
  const checkedAt = new Date().toISOString();
  const renewedThrough = Date.parse(checkedAt) + FEED_DEAL_LIFETIME_MS;
  const { data, error } = await supabase
    .from("deals")
    .select(
      "id, asin, title, image_url, amazon_url, current_price, avg_90_price, deal_score, scoring_components, badges, expires_at, source",
    )
    .eq("status", "active")
    .order("expires_at")
    .order("id")
    .limit(PUBLIC_DEAL_LIMIT);

  if (error) throw new Error(`Failed to load live deals: ${error.message}`);

  const deals = (data || []) as Deal[];
  const currentDeals = deals.filter(
    (deal) => new Date(deal.expires_at).getTime() > Date.now(),
  );
  const expiredDeals = deals.filter(
    (deal) => new Date(deal.expires_at).getTime() <= Date.now(),
  );

  for (const deal of expiredDeals) {
    const { error: updateError } = await supabase
      .from("deals")
      .update({
        status: "killed",
        scoring_components: lifecycleComponents(
          deal,
          checkedAt,
          "removed",
          "expired",
        ),
      })
      .eq("id", deal.id)
      .eq("status", "active")
      .eq("expires_at", deal.expires_at);
    if (updateError) throw new Error(`Failed to expire ${deal.asin}: ${updateError.message}`);
  }

  const asins = currentDeals.map((deal) => deal.asin.trim().toUpperCase());
  const amazon = await getAmazonItemsInBatches(asins);
  const amazonByAsin = new Map(
    amazon.items.map((item) => [item.asin.trim().toUpperCase(), item] as const),
  );
  const refreshed = [];
  const removed = expiredDeals.map((deal) => ({ asin: deal.asin, reason: "expired" }));
  let preserved = 0;

  for (const deal of currentDeals) {
    const asin = deal.asin.trim().toUpperCase();
    const item = amazonByAsin.get(asin);

    if (amazon.failedAsins.has(asin) || !item) {
      preserved += 1;
      continue;
    }

    const unavailable = isExplicitlyUnavailable(item.availability);
    const renews = deal.source === FEED_HUB_SOURCE;
    const previousPrice = Number(deal.current_price || 0);
    const priorLifecycle = toRecord(toRecord(deal.scoring_components).lifecycle);
    const referencePrice = Number(priorLifecycle.referencePrice) || previousPrice;
    const priceThreshold = renews ? Math.min(referencePrice, previousPrice) : previousPrice;
    const currentPrice = Number(item.currentPrice || 0);
    const materialIncrease =
      priceThreshold > 0 &&
      currentPrice >
        priceThreshold +
          Math.max(
            MATERIAL_PRICE_INCREASE_DOLLARS,
            priceThreshold * MATERIAL_PRICE_INCREASE_PERCENT,
          );

    if (unavailable || currentPrice <= 0 || materialIncrease) {
      const reason = unavailable
        ? "amazon_unavailable"
        : currentPrice <= 0
          ? "amazon_price_missing"
          : "price_increased";
      const { error: updateError } = await supabase
        .from("deals")
        .update({
          status: "killed",
          scoring_components: lifecycleComponents(
            deal,
            checkedAt,
            "removed",
            reason,
          ),
        })
        .eq("id", deal.id)
        .eq("status", "active")
        .eq("expires_at", deal.expires_at);
      if (updateError) throw new Error(`Failed to remove ${asin}: ${updateError.message}`);
      removed.push({ asin, reason });
      continue;
    }

    const oldComponents = toRecord(deal.scoring_components);
    const scoring = scoreDeal({
      currentPrice,
      avg90Price: Number(deal.avg_90_price) || null,
      brandBonus: Number(oldComponents.brandScore),
    });
    const scoringComponents = {
      ...oldComponents,
      ...scoring.components,
      lifecycle: { checkedAt, outcome: "refreshed", reason: null, ...(renews ? { referencePrice } : {}) },
    };
    const dealScore = scoring.totalScore ?? 0;
    const badges = new Set((deal.badges || []).filter(
      (badge) => badge !== "Huge Discount" && badge !== "All Time Low",
    ));
    for (const badge of scoring.badges) badges.add(badge);

    const renewedExpiry = new Date(Math.max(Date.parse(deal.expires_at), renewedThrough));
    const { error: updateError } = await supabase
      .from("deals")
      .update({
        current_price: currentPrice,
        ...(renews ? { expires_at: renewedExpiry.toISOString() } : {}),
        title: item.title || deal.title,
        image_url: item.imageUrl || deal.image_url,
        amazon_url: item.affiliateUrl || deal.amazon_url,
        deal_score: dealScore,
        scoring_components: scoringComponents,
        badges: Array.from(badges),
      })
      .eq("id", deal.id)
      .eq("status", "active")
      .eq("expires_at", deal.expires_at);
    if (updateError) throw new Error(`Failed to refresh ${asin}: ${updateError.message}`);

    refreshed.push({ id: deal.id, asin, current_price: currentPrice, deal_score: dealScore, scoring_components: scoringComponents });
  }

  return {
    selected: deals.length,
    refreshed: refreshed.length,
    removed,
    preserved,
    amazonErrors: amazon.errors,
    deals: refreshed,
  };
}
