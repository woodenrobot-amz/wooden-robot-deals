import { NextResponse } from "next/server";
import { isScheduleDate } from "@/lib/deal-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

const EVENT_FIELDS = [
  "id",
  "posting_group_id",
  "schedule_date",
  "schedule_hour",
  "source",
  "asin",
  "product_title",
  "affiliate_url",
  "post_body",
  "posted_at",
  "platform",
  "destination",
  "category",
  "notes",
].join(", ");

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function validLength(value: string | null, max: number) {
  return value === null || value.length <= max;
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
    productTitle?: string;
    destination?: string;
    scheduleDate?: string;
    postedAt?: string;
    platform?: string;
    postingGroupId?: string | null;
    asin?: string | null;
    url?: string | null;
    postBody?: string;
    category?: string | null;
    notes?: string | null;
  } | null;

  const productTitle = optionalText(body?.productTitle);
  const destination = optionalText(body?.destination);
  const scheduleDate = body?.scheduleDate;
  const postedAt = body?.postedAt;
  const platform = optionalText(body?.platform);
  const postingGroupId = optionalText(body?.postingGroupId);
  const asin = optionalText(body?.asin)?.toUpperCase() || null;
  const rawUrl = optionalText(body?.url);
  const postBody = typeof body?.postBody === "string" ? body.postBody.trim() : "";
  const category = optionalText(body?.category);
  const notes = optionalText(body?.notes);

  if (!productTitle || productTitle.length > 300) {
    return NextResponse.json({ error: "Add a product/title up to 300 characters." }, { status: 400 });
  }
  if (!destination || destination.length > 160) {
    return NextResponse.json({ error: "Add a destination up to 160 characters." }, { status: 400 });
  }
  if (!isScheduleDate(scheduleDate)) {
    return NextResponse.json({ error: "Use a valid post date." }, { status: 400 });
  }
  if (!postedAt || Number.isNaN(new Date(postedAt).getTime())) {
    return NextResponse.json({ error: "Use a valid post date and time." }, { status: 400 });
  }
  if (postingGroupId && !UUID_PATTERN.test(postingGroupId)) {
    return NextResponse.json({ error: "Choose a valid posting group." }, { status: 400 });
  }
  if (asin && !ASIN_PATTERN.test(asin)) {
    return NextResponse.json({ error: "ASINs must be 10 letters or numbers." }, { status: 400 });
  }
  if (!validLength(platform, 80) || !validLength(category, 120) || !validLength(notes, 2000)) {
    return NextResponse.json({ error: "One of the optional fields is too long." }, { status: 400 });
  }
  if (postBody.length > 10000) {
    return NextResponse.json({ error: "Post text must be 10,000 characters or less." }, { status: 400 });
  }

  let url: string | null = null;
  if (rawUrl) {
    if (rawUrl.length > 2000) {
      return NextResponse.json({ error: "URL must be 2,000 characters or less." }, { status: 400 });
    }
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported protocol");
      url = parsed.toString();
    } catch {
      return NextResponse.json({ error: "Use a valid http or https URL." }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  if (postingGroupId) {
    const { data: group, error: groupError } = await admin
      .from("deal_posting_groups")
      .select("id")
      .eq("id", postingGroupId)
      .eq("is_active", true)
      .maybeSingle();
    if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });
    if (!group) return NextResponse.json({ error: "Posting group not found." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("deal_post_events")
    .insert({
      user_id: user.id,
      schedule_item_id: null,
      posting_group_id: postingGroupId,
      schedule_date: scheduleDate,
      schedule_hour: null,
      source: "unplanned",
      asin,
      product_title: productTitle,
      affiliate_url: url,
      post_body: postBody,
      comment_text: "",
      posted_at: new Date(postedAt).toISOString(),
      platform,
      destination,
      category,
      notes,
    })
    .select(EVENT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}
