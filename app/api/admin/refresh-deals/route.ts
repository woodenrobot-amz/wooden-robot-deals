import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAmazonItems } from "@/lib/amazon-creators";

function getDiscountScore(discountPercent: number) {
  if (discountPercent >= 40) return 35;
  if (discountPercent >= 30) return 30;
  if (discountPercent >= 20) return 24;
  if (discountPercent >= 15) return 18;
  if (discountPercent >= 10) return 12;
  if (discountPercent >= 5) return 6;
  return 0;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function POST() {
  try {
    const userSupabase = await createClient();

    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: deals, error: dealsError } = await adminSupabase
      .from("deals")
      .select(
        `
          id,
          asin,
          title,
          image_url,
          amazon_url,
          current_price,
          avg_90_price,
          scoring_components,
          badges
        `,
      )
      .eq("status", "active")
      .limit(50);

    if (dealsError) throw dealsError;

    const asins = (deals || [])
      .map((deal) =>
        String(deal.asin || "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean);

    const amazonItems = [];

    for (let i = 0; i < asins.length; i += 10) {
      const chunk = asins.slice(i, i + 10);
      const items = await getAmazonItems(chunk);
      amazonItems.push(...items);
    }

    const amazonByAsin = new Map(
      amazonItems.map((item) => [item.asin.toUpperCase(), item]),
    );

    const refreshedDeals = [];

    for (const deal of deals || []) {
      const asin = String(deal.asin || "")
        .trim()
        .toUpperCase();
      const amazonItem = amazonByAsin.get(asin);

      if (!amazonItem?.currentPrice) {
        continue;
      }

      const currentPrice = amazonItem.currentPrice;
      const avg90Price = Number(deal.avg_90_price || 0);

      const discountPercent =
        avg90Price > 0 && currentPrice < avg90Price
          ? ((avg90Price - currentPrice) / avg90Price) * 100
          : 0;

      const discountScore = getDiscountScore(discountPercent);

      const oldComponents = deal.scoring_components || {};

      const scoringComponents = {
        ...oldComponents,
        discountPercent: Math.round(discountPercent * 10) / 10,
        discountScore,
      };

      const dealScore = clampScore(
        discountScore +
          Number(oldComponents.brandScore || 0) +
          Number(oldComponents.demandScore || 0) +
          Number(oldComponents.confidenceScore || 0),
      );

      const badges = new Set<string>(deal.badges || []);

      badges.delete("Huge Discount");
      badges.delete("All Time Low");

      if (discountPercent >= 20) badges.add("Huge Discount");
      if (discountPercent >= 35) badges.add("All Time Low");

      const update = {
        current_price: currentPrice,
        title: amazonItem.title || deal.title,
        image_url: amazonItem.imageUrl || deal.image_url,
        amazon_url: amazonItem.affiliateUrl || deal.amazon_url,
        deal_score: dealScore,
        scoring_components: scoringComponents,
        badges: Array.from(badges),
      };

      const { error: updateError } = await adminSupabase
        .from("deals")
        .update(update)
        .eq("id", deal.id);

      if (updateError) throw updateError;

      refreshedDeals.push({
        id: deal.id,
        asin,
        current_price: currentPrice,
        deal_score: dealScore,
        scoring_components: scoringComponents,
      });
    }

    return NextResponse.json({
      refreshed: refreshedDeals.length,
      skipped: asins.length - refreshedDeals.length,
      deals: refreshedDeals,
    });
  } catch (error) {
    console.error("refresh-deals failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown refresh-deals server error.",
      },
      { status: 500 },
    );
  }
}
