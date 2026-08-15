import { NextResponse } from "next/server";
import { scoreDeal } from "@/lib/scoring";
import { getIgnoredAsins } from "@/lib/ignored-asins";
import { getBrandTierMap, normalizeBrandName } from "@/lib/brandTiers";
import { getPaapiProductByAsin } from "@/lib/paapi";
import {
  getKeepaBestPrice,
  getKeepaImageUrl,
  getKeepaDemand,
  getKeepaProductByAsin,
} from "@/lib/keepa/product";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const asin = String(body.asin || "")
      .trim()
      .toUpperCase();

    if (!asin) {
      return NextResponse.json({ error: "ASIN is required." }, { status: 400 });
    }

    const ignoredAsins = await getIgnoredAsins();

    if (ignoredAsins.has(asin)) {
      return NextResponse.json(
        { error: `ASIN ${asin} is on the ignored list.` },
        { status: 409 },
      );
    }

    const product = await getKeepaProductByAsin(asin);

    let paapiProduct = null;

    try {
      paapiProduct = await getPaapiProductByAsin(asin);
    } catch (error) {
      console.error("PA-API lookup failed, falling back to Keepa:", error);
    }

    const brand = product.brand || "Unknown Brand";
    const title =
      paapiProduct?.title || product.title || `Amazon product ${asin}`;

    const image_url = paapiProduct?.imageUrl || getKeepaImageUrl(product);

    const keepaPrices = getKeepaBestPrice(product);
    const keepaDemand = getKeepaDemand(product);
    const currentPrice = paapiProduct?.currentPrice || keepaPrices.currentPrice;
    const avg90Price = keepaPrices.avg90Price;

    const brandTierMap = await getBrandTierMap();
    const matchedBrand = brandTierMap.get(normalizeBrandName(brand));
    const brandTier = matchedBrand?.tier || "unrated";
    const brandBonus = matchedBrand?.score_bonus || 0;

    const scoring = scoreDeal({
      brand,
      brandTier,
      brandBonus,
      currentPrice,
      avg90Price,
      rating: keepaDemand.rating,
      reviewCount: keepaDemand.reviewCount,
      salesRank: product.salesRanks?.[0] || null,
      hasImage: Boolean(image_url),
      hasTitle: Boolean(title),
    });

    return NextResponse.json({
      asin,
      title,
      brand,
      category_id: "woodworking",
      image_url,
      amazon_url:
        paapiProduct?.detailPageUrl ||
        `https://www.amazon.com/dp/${asin}?tag=${
          process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || ""
        }`,
      keepa_url: `https://keepa.com/#!product/1-${asin}`,
      current_price: currentPrice,
      avg_90_price: avg90Price,
      deal_score: scoring.totalScore,
      badges: scoring.badges,
      scoring_components: scoring.components,
      brand_tier: brandTier,
      brand_bonus: brandBonus,
      rating: keepaDemand.rating,
      review_count: keepaDemand.reviewCount,
    });
  } catch (error) {
    console.error("enrich-asin failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown enrich-asin server error.",
      },
      { status: 500 },
    );
  }
}
