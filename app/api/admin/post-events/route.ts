import { NextResponse } from "next/server";
import { dateInEasternTime, isScheduleDate } from "@/lib/deal-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

const EVENT_FIELDS = [
  "id",
  "source",
  "asin",
  "post_body",
  "comment_text",
  "posted_at",
].join(", ");

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = new URL(request.url).searchParams.get("date");
  if (!isScheduleDate(date)) {
    return NextResponse.json({ error: "Use a valid YYYY-MM-DD date." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deal_post_events")
    .select(EVENT_FIELDS)
    .eq("user_id", user.id)
    .eq("schedule_date", date)
    .is("voided_at", null)
    .order("posted_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data || [] });
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    asin?: string;
    postBody?: string;
    commentText?: string;
  } | null;

  const asin = typeof body?.asin === "string" ? body.asin.trim().toUpperCase() : "";
  const postBody = typeof body?.postBody === "string" ? body.postBody.trim() : "";
  const commentText = typeof body?.commentText === "string" ? body.commentText.trim() : "";

  if (!ASIN_PATTERN.test(asin)) {
    return NextResponse.json({ error: "ASIN must be 10 letters or numbers." }, { status: 400 });
  }
  if (postBody.length > 10000 || commentText.length > 10000) {
    return NextResponse.json(
      { error: "Post and comment text must each be 10,000 characters or less." },
      { status: 400 },
    );
  }

  const now = new Date();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deal_post_events")
    .insert({
      user_id: user.id,
      schedule_item_id: null,
      posting_group_id: null,
      schedule_date: dateInEasternTime(now),
      schedule_hour: null,
      source: "unplanned",
      asin,
      parent_asin: null,
      product_title: null,
      price_at_posting: null,
      currency_code: null,
      affiliate_url: null,
      post_body: postBody,
      comment_text: commentText,
      posted_at: now.toISOString(),
      platform: null,
      destination: null,
      category: null,
      notes: null,
    })
    .select(EVENT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}
