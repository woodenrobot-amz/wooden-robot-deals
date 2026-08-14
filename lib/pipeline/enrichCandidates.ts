import "server-only";

import { getAmazonItems, type AmazonPublicItem } from "@/lib/amazon-creators";
import { getBrandTierMap, normalizeBrandName } from "@/lib/brandTiers";
import {
  getKeepaBestPrice,
  getKeepaImageUrl,
  getKeepaProductsByAsins,
} from "@/lib/keepa/product";
import { scoreDeal } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";

const AMAZON_BATCH_LIMIT = 10;
const AMAZON_BATCH_DELAY_MS = 1_100;
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;

type Candidate = {
  asin: string;
  stream_id: string;
  category_id: string | null;
  status: string;
  raw_data: Record<string, unknown> | null;
};

function clampBatchSize(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value!)));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function getAmazonItemsInBatches(asins: string[]) {
  const items: AmazonPublicItem[] = [];
  const errors: string[] = [];

  const batches = chunk(asins, AMAZON_BATCH_LIMIT);

  for (let index = 0; index < batches.length; index += 1) {
    if (index > 0) {
      await wait(AMAZON_BATCH_DELAY_MS);
    }

    try {
      const batch = batches[index];
      items.push(...(await getAmazonItems(batch)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown Amazon error");
    }
  }

  return { items, errors };
}

export async function enrichCandidateQueue(requestedLimit?: number) {
  const supabase = createAdminClient();
  const limit = clampBatchSize(requestedLimit);

  const { data, error } = await supabase
    .from("deal_candidates")
    .select("asin, stream_id, category_id, status, raw_data")
    .in("status", ["new", "candidate"])
    .order("asin", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load candidates: ${error.message}`);
  }

  const candidates = (data || []) as Candidate[];

  if (candidates.length === 0) {
    return {
      requested: limit,
      selected: 0,
      enriched: 0,
      ignored: 0,
      failed: 0,
      tokensConsumed: 0,
      tokensLeft: null,
      amazonItems: 0,
      amazonMissing: 0,
      amazonErrors: [],
    };
  }

  const { data: ignoredRows, error: ignoredError } = await supabase
    .from("ignored_asins")
    .select("asin");

  if (ignoredError) {
    throw new Error(`Failed to load ignored ASINs: ${ignoredError.message}`);
  }

  const ignoredAsins = new Set(
    (ignoredRows || []).map((row) => String(row.asin || "").toUpperCase()),
  );

  const activeCandidates = candidates.filter(
    (candidate) => !ignoredAsins.has(candidate.asin.toUpperCase()),
  );
  const ignoredCandidates = candidates.filter((candidate) =>
    ignoredAsins.has(candidate.asin.toUpperCase()),
  );

  for (const candidate of ignoredCandidates) {
    const rawData = toRecord(candidate.raw_data);
    const { error: updateError } = await supabase
      .from("deal_candidates")
      .update({
        status: "ignored",
        raw_data: {
          ...rawData,
          pipeline: {
            outcome: "ignored",
            processed_at: new Date().toISOString(),
          },
        },
      })
      .eq("asin", candidate.asin)
      .eq("stream_id", candidate.stream_id);

    if (updateError) {
      throw new Error(
        `Failed to mark ignored candidate ${candidate.asin}: ${updateError.message}`,
      );
    }
  }

  if (activeCandidates.length === 0) {
    return {
      requested: limit,
      selected: candidates.length,
      enriched: 0,
      ignored: ignoredCandidates.length,
      failed: 0,
      tokensConsumed: 0,
      tokensLeft: null,
      amazonItems: 0,
      amazonMissing: 0,
      amazonErrors: [],
    };
  }

  const asins = activeCandidates.map((candidate) =>
    candidate.asin.trim().toUpperCase(),
  );
  const keepaResult = await getKeepaProductsByAsins(asins);
  const amazonResult = await getAmazonItemsInBatches(asins);
  const brandTierMap = await getBrandTierMap();

  const keepaByAsin = new Map(
    keepaResult.products.map(
      (product) =>
        [String(product.asin || "").toUpperCase(), product] as const,
    ),
  );
  const amazonByAsin = new Map(
    amazonResult.items.map(
      (item) => [item.asin.toUpperCase(), item] as const,
    ),
  );

  let enriched = 0;
  let failed = 0;

  for (const candidate of activeCandidates) {
    const asin = candidate.asin.toUpperCase();
    const product = keepaByAsin.get(asin);
    const rawData = toRecord(candidate.raw_data);

    if (!product) {
      failed += 1;

      const { error: updateError } = await supabase
        .from("deal_candidates")
        .update({
          status: "error",
          raw_data: {
            ...rawData,
            pipeline: {
              outcome: "error",
              message: "Keepa returned no product.",
              processed_at: new Date().toISOString(),
            },
          },
        })
        .eq("asin", candidate.asin)
        .eq("stream_id", candidate.stream_id);

      if (updateError) {
        throw new Error(
          `Failed to record candidate error ${asin}: ${updateError.message}`,
        );
      }

      continue;
    }

    const amazonItem = amazonByAsin.get(asin);
    const brand = amazonItem?.brand || product.brand || "Unknown Brand";
    const title =
      amazonItem?.title || product.title || `Amazon product ${asin}`;
    const imageUrl = amazonItem?.imageUrl || getKeepaImageUrl(product);
    const keepaPrices = getKeepaBestPrice(product);
    const currentPrice = amazonItem?.currentPrice || keepaPrices.currentPrice;
    const avg90Price = keepaPrices.avg90Price;
    const matchedBrand = brandTierMap.get(normalizeBrandName(brand));
    const brandTier = matchedBrand?.tier || "unrated";
    const brandBonus = matchedBrand?.score_bonus || 0;
    const salesRank = Number(product?.stats?.current?.[3]);

    const scoring = scoreDeal({
      brand,
      brandTier,
      brandBonus,
      currentPrice,
      avg90Price,
      rating: product.rating ? product.rating / 10 : null,
      reviewCount: product.reviewCount || null,
      salesRank: Number.isFinite(salesRank) && salesRank > 0 ? salesRank : null,
      hasImage: Boolean(imageUrl),
      hasTitle: Boolean(title),
    });

    const enrichment = {
      asin,
      title,
      brand,
      category_id: candidate.category_id,
      image_url: imageUrl,
      amazon_url:
        amazonItem?.affiliateUrl ||
        `https://www.amazon.com/dp/${asin}?tag=${
          process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG ||
          process.env.AMAZON_PARTNER_TAG ||
          ""
        }`,
      keepa_url: `https://keepa.com/#!product/1-${asin}`,
      current_price: currentPrice,
      avg_90_price: avg90Price,
      deal_score: scoring.totalScore,
      badges: scoring.badges,
      scoring_components: {
        ...scoring.components,
        shippingCheck: {
          amazonPrice: amazonItem?.currentPrice ?? null,
          keepaLandedPrice: keepaLanded.currentLandedPrice,
          estimatedShipping,
          effectiveDiscountPercent,
          checkedAt: new Date().toISOString(),
          source: "keepa_buy_box_shipping",
        },
      },
      amazon_price: amazonItem?.currentPrice ?? null,
      keepa_landed_price: keepaLanded.currentLandedPrice,
      estimated_shipping: estimatedShipping,
      effective_discount_percent: effectiveDiscountPercent,
      brand_tier: brandTier,
      brand_bonus: brandBonus,
      rating: product.rating ? product.rating / 10 : null,
      review_count: product.reviewCount || null,
      sales_rank:
        Number.isFinite(salesRank) && salesRank > 0 ? salesRank : null,
      parent_asin: amazonItem?.parentAsin || product.parentAsin || null,
      enriched_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("deal_candidates")
      .update({
        status: "enriched",
        raw_data: {
          ...rawData,
          enrichment,
          pipeline: {
            outcome: "enriched",
            processed_at: new Date().toISOString(),
          },
        },
      })
      .eq("asin", candidate.asin)
      .eq("stream_id", candidate.stream_id);

    if (updateError) {
      throw new Error(
        `Failed to save enrichment for ${asin}: ${updateError.message}`,
      );
    }

    enriched += 1;
  }

  return {
    requested: limit,
    selected: candidates.length,
    enriched,
    ignored: ignoredCandidates.length,
    failed,
    tokensConsumed: keepaResult.tokensConsumed,
    tokensLeft: keepaResult.tokensLeft,
    amazonItems: amazonResult.items.length,
    amazonMissing: Math.max(0, activeCandidates.length - amazonResult.items.length),
    amazonErrors: amazonResult.errors,
  };
}
