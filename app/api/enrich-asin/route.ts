import { NextResponse } from "next/server";
import { scoreDeal } from "@/lib/scoring";
import { getIgnoredAsins } from "@/lib/ignored-asins";

const KEEPA_DOMAIN_US = 1;

function keepaCentsToDollars(value: unknown) {
  const cents = Number(value);

  if (!Number.isFinite(cents) || cents <= 0) return null;

  return Math.round((cents / 100) * 100) / 100;
}

function getImageUrl(product: any) {
  if (product.imagesCSV) {
    return `https://images-na.ssl-images-amazon.com/images/I/${
      String(product.imagesCSV).split(",")[0]
    }`;
  }

  if (Array.isArray(product.images) && product.images.length) {
    const first = product.images[0];

    if (first.l) {
      return `https://images-na.ssl-images-amazon.com/images/I/${first.l}`;
    }

    if (first.m) {
      return `https://images-na.ssl-images-amazon.com/images/I/${first.m}`;
    }
  }

  return "";
}

function getBestPrice(product: any) {
  const current = product?.stats?.current || [];
  const avg90 = product?.stats?.avg90 || [];

  // Keepa price indexes vary by metric. These are useful fallbacks:
  // 18 = Buy Box, 1 = New, 0 = Amazon
  const currentCandidates = [current[18], current[1], current[0]];
  const avg90Candidates = [avg90[18], avg90[1], avg90[0]];

  const currentPrice =
    currentCandidates.map(keepaCentsToDollars).find(Boolean) || null;

  const avg90Price =
    avg90Candidates.map(keepaCentsToDollars).find(Boolean) || null;

  return { currentPrice, avg90Price };
}

function calculateDealScore(
  currentPrice: number | null,
  avg90Price: number | null,
) {
  if (!currentPrice || !avg90Price || currentPrice >= avg90Price) return 50;

  const discountPercent = ((avg90Price - currentPrice) / avg90Price) * 100;

  return Math.min(100, Math.round(50 + discountPercent));
}

function buildBadges(
  currentPrice: number | null,
  avg90Price: number | null,
  brand: string,
) {
  const badges: string[] = [];

  const topBrands = [
    "DeWalt",
    "Milwaukee",
    "Makita",
    "Bosch",
    "Festool",
    "SawStop",
  ];

  if (
    topBrands.some((topBrand) =>
      brand.toLowerCase().includes(topBrand.toLowerCase()),
    )
  ) {
    badges.push("Top Brand");
  }

  if (currentPrice && avg90Price) {
    const discountPercent = ((avg90Price - currentPrice) / avg90Price) * 100;

    if (discountPercent >= 25) badges.push("Huge Discount");
  }

  badges.push("Keepa");

  return badges;
}

export async function POST(request: Request) {
  const body = await request.json();
  const asin = String(body.asin || "")
    .trim()
    .toUpperCase();

  if (!asin) {
    return NextResponse.json({ error: "ASIN is required." }, { status: 400 });
  }

  const ignoredAsins = getIgnoredAsins();

  if (ignoredAsins.has(asin)) {
    return NextResponse.json(
      {
        error: `ASIN ${asin} is on the ignored list.`,
      },
      { status: 409 },
    );
  }

  const keepaKey = process.env.KEEPA_API_KEY;

  if (!keepaKey) {
    return NextResponse.json(
      { error: "Missing KEEPA_API_KEY environment variable." },
      { status: 500 },
    );
  }

  const keepaUrl = new URL("https://api.keepa.com/product");
  keepaUrl.searchParams.set("key", keepaKey);
  keepaUrl.searchParams.set("domain", String(KEEPA_DOMAIN_US));
  keepaUrl.searchParams.set("asin", asin);
  keepaUrl.searchParams.set("stats", "90");

  const response = await fetch(keepaUrl.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Keepa request failed: ${response.status}` },
      { status: 500 },
    );
  }

  const data = await response.json();
  const product = data.products?.[0];

  if (!product) {
    return NextResponse.json(
      { error: "No Keepa product found for that ASIN." },
      { status: 404 },
    );
  }

  const brand = product.brand || "Unknown Brand";
  const title = product.title || `Amazon product ${asin}`;

  const imageNames = String(product.imagesCSV || "")
    .split(",")
    .map((image: string) => image.trim())
    .filter(Boolean);

  const imageName = imageNames[0] || "";

  const image_url = getImageUrl(product);

  const { currentPrice, avg90Price } = getBestPrice(product);

  const scoring = scoreDeal({
    brand,
    currentPrice,
    avg90Price,
    rating: product.rating ? product.rating / 10 : null,
    reviewCount: product.reviewCount || null,
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
    amazon_url: `https://www.amazon.com/dp/${asin}?tag=${process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || ""}`,
    current_price: currentPrice,
    avg_90_price: avg90Price,
    deal_score: scoring.totalScore,
    badges: scoring.badges,
    scoring_components: scoring.components,
    brand_tier: scoring.brandTier,
  });
}
