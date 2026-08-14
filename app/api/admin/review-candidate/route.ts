import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ReviewAction = "publish" | "reject" | "ignore";

function isAction(value: unknown): value is ReviewAction {
  return value === "publish" || value === "reject" || value === "ignore";
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    asin?: string;
    streamId?: string;
    action?: unknown;
  } | null;
  const asin = body?.asin?.trim().toUpperCase();
  const streamId = body?.streamId?.trim();
  const action = body?.action;

  if (!asin || !streamId || !isAction(action)) {
    return NextResponse.json({ error: "Invalid review request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: candidate, error } = await admin
    .from("deal_candidates")
    .select("asin, stream_id, category_id, raw_data")
    .eq("asin", asin)
    .eq("stream_id", streamId)
    .eq("status", "enriched")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "Candidate is no longer available." }, { status: 404 });

  const rawData = toRecord(candidate.raw_data);
  const enrichment = toRecord(rawData.enrichment);

  if (action === "publish") {
    const deal = {
      asin,
      title: String(enrichment.title || `Amazon product ${asin}`),
      brand: String(enrichment.brand || "Unknown Brand"),
      brand_tier: String(enrichment.brand_tier || "unrated"),
      category_id: candidate.category_id || enrichment.category_id || null,
      image_url: enrichment.image_url || null,
      amazon_url: enrichment.amazon_url || `https://www.amazon.com/dp/${asin}`,
      current_price: enrichment.current_price || null,
      avg_90_price: enrichment.avg_90_price || null,
      deal_score: Number(enrichment.deal_score || 0),
      badges: Array.isArray(enrichment.badges) ? enrichment.badges : [],
      scoring_components: toRecord(enrichment.scoring_components),
      status: "active",
      source: `candidate:${streamId}`,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    };

    const { data: existing } = await admin
      .from("deals")
      .select("id")
      .eq("asin", asin)
      .maybeSingle();

    const write = existing
      ? await admin.from("deals").update(deal).eq("id", existing.id)
      : await admin.from("deals").insert(deal);

    if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });
  }

  if (action === "ignore") {
    const { error: ignoreError } = await admin.from("ignored_asins").upsert({
      asin,
      title: enrichment.title || null,
      brand: enrichment.brand || null,
      image_url: enrichment.image_url || null,
      reason: "Ignored during candidate review",
    });

    if (ignoreError) return NextResponse.json({ error: ignoreError.message }, { status: 500 });
  }

  const status = action === "publish" ? "published" : action === "ignore" ? "ignored" : "rejected";
  const { error: updateError } = await admin
    .from("deal_candidates")
    .update({
      status,
      raw_data: {
        ...rawData,
        pipeline: {
          ...toRecord(rawData.pipeline),
          outcome: status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.email || user.id,
        },
      },
    })
    .eq("asin", asin)
    .eq("stream_id", streamId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, asin, action, live: action === "publish" });
}
