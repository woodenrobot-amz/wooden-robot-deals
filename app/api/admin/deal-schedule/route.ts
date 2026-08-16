import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isScheduleDate,
  SCHEDULE_END_HOUR,
  SCHEDULE_START_HOUR,
  type ScheduleStatus,
} from "@/lib/deal-schedule";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

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
  const [groupsResult, itemsResult] = await Promise.all([
    admin
      .from("deal_posting_groups")
      .select("id, name, slug, accent, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    admin
      .from("deal_schedule_items")
      .select(
        "id, posting_group_id, schedule_date, schedule_hour, post_body, comment_text, asin, status, posted_at, updated_at",
      )
      .eq("user_id", user.id)
      .eq("schedule_date", date)
      .order("schedule_hour"),
  ]);

  if (groupsResult.error) {
    return NextResponse.json({ error: groupsResult.error.message }, { status: 500 });
  }
  if (itemsResult.error) {
    return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    groups: groupsResult.data || [],
    items: itemsResult.data || [],
  });
}

export async function PUT(request: Request) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    postingGroupId?: string;
    scheduleDate?: string;
    scheduleHour?: number;
    postBody?: string;
    commentText?: string;
    asin?: string | null;
    status?: ScheduleStatus;
  } | null;

  const postingGroupId = body?.postingGroupId;
  const scheduleDate = body?.scheduleDate;
  const scheduleHour = body?.scheduleHour;
  const postBody = body?.postBody?.trim() ?? "";
  const commentText = body?.commentText?.trim() ?? "";
  const asin = body?.asin?.trim().toUpperCase() || null;
  const status = body?.status;

  if (!postingGroupId || !UUID_PATTERN.test(postingGroupId)) {
    return NextResponse.json({ error: "Choose a valid posting group." }, { status: 400 });
  }
  if (!isScheduleDate(scheduleDate)) {
    return NextResponse.json({ error: "Use a valid schedule date." }, { status: 400 });
  }
  if (
    !Number.isInteger(scheduleHour) ||
    scheduleHour! < SCHEDULE_START_HOUR ||
    scheduleHour! > SCHEDULE_END_HOUR
  ) {
    return NextResponse.json({ error: "Schedule hour must be between 7 AM and 7 PM." }, { status: 400 });
  }
  if (postBody.length > 10000 || commentText.length > 10000) {
    return NextResponse.json({ error: "Post and comment text must each be 10,000 characters or less." }, { status: 400 });
  }
  if (asin && !ASIN_PATTERN.test(asin)) {
    return NextResponse.json({ error: "ASINs must be 10 letters or numbers." }, { status: 400 });
  }
  if (status !== "planned" && status !== "posted") {
    return NextResponse.json({ error: "Choose a valid schedule status." }, { status: 400 });
  }

  const admin = createAdminClient();
  const [groupResult, existingResult] = await Promise.all([
    admin
      .from("deal_posting_groups")
      .select("id")
      .eq("id", postingGroupId)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("deal_schedule_items")
      .select("posted_at")
      .eq("user_id", user.id)
      .eq("posting_group_id", postingGroupId)
      .eq("schedule_date", scheduleDate)
      .eq("schedule_hour", scheduleHour!)
      .maybeSingle(),
  ]);

  if (groupResult.error) {
    return NextResponse.json({ error: groupResult.error.message }, { status: 500 });
  }
  if (existingResult.error) {
    return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  }
  if (!groupResult.data) {
    return NextResponse.json({ error: "Posting group not found." }, { status: 404 });
  }

  if (!postBody && !commentText && !asin && status === "planned") {
    const { error } = await admin
      .from("deal_schedule_items")
      .delete()
      .eq("user_id", user.id)
      .eq("posting_group_id", postingGroupId)
      .eq("schedule_date", scheduleDate)
      .eq("schedule_hour", scheduleHour!);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: null });
  }

  const now = new Date().toISOString();
  const { data: item, error } = await admin
    .from("deal_schedule_items")
    .upsert(
      {
        user_id: user.id,
        posting_group_id: postingGroupId,
        schedule_date: scheduleDate,
        schedule_hour: scheduleHour,
        post_body: postBody,
        comment_text: commentText,
        asin,
        status,
        posted_at: status === "posted" ? existingResult.data?.posted_at || now : null,
        updated_at: now,
      },
      { onConflict: "user_id,posting_group_id,schedule_date,schedule_hour" },
    )
    .select(
      "id, posting_group_id, schedule_date, schedule_hour, post_body, comment_text, asin, status, posted_at, updated_at",
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item });
}
