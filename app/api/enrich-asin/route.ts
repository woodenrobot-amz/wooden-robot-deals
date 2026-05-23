import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const asin = String(body.asin || "").trim().toUpperCase();

  if (!asin) {
    return NextResponse.json(
      { error: "ASIN is required." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    asin,
    title: `Test enriched product for ${asin}`,
    brand: "Test Brand",
    category_id: "woodworking",
    image_url: "https://m.media-amazon.com/images/I/71pIJxZ9+ML._AC_SL1500_.jpg",
    amazon_url: `https://amazon.com/dp/${asin}`,
    current_price: 99.99,
    avg_90_price: 149.99,
    deal_score: 75,
    badges: ["Test Data", "Needs Review"],
  });
}