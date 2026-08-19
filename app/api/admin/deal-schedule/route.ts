import { NextResponse } from "next/server";
import { getAmazonItems, type AmazonPublicItem } from "@/lib/amazon-creators";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isScheduleDate,
  recurringDailySlot,
  SCHEDULE_END_HOUR,
  SCHEDULE_START_HOUR,
  type ScheduleStatus,
} from "@/lib/deal-schedule";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const MAX_COMMENTS = 5;

async function authenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

type PostSnapshot = Pick<AmazonPublicItem, "parentAsin" | "title" | "currentPrice" | "affiliateUrl">;

type CommentInput = {
  position: number;
  commentText: string;
  asin: string | null;
};

async function getPostSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  asin: string | null,
): Promise<PostSnapshot | null> {
  if (!asin) return null;

  const { data: savedDeal } = await admin
    .from("deals")
    .select("title, current_price, amazon_url")
    .eq("asin", asin)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (savedDeal?.current_price != null) {
    return {
      parentAsin: null,
      title: savedDeal.title || null,
      currentPrice: Number(savedDeal.current_price),
      affiliateUrl: savedDeal.amazon_url || `https://www.amazon.com/dp/${asin}`,
    };
  }

  try {
    const [amazonItem] = await getAmazonItems([asin]);
    if (amazonItem) return amazonItem;
  } catch (error) {
    console.warn("Could not enrich deal post event", {
      asin,
      error: error instanceof Error ? error.message : "Unknown Amazon API error",
    });
  }

  return savedDeal
    ? {
        parentAsin: null,
        title: savedDeal.title || null,
        currentPrice: savedDeal.current_price == null ? null : Number(savedDeal.current_price),
        affiliateUrl: savedDeal.amazon_url || `https://www.amazon.com/dp/${asin}`,
      }
    : null;
}

function normalizeComments(body: {
  comments?: Array<{ commentText?: string; asin?: string | null }>;
  commentText?: string;
  asin?: string | null;
}): CommentInput[] {
  const source = Array.isArray(body.comments)
    ? body.comments.slice(0, MAX_COMMENTS)
    : [{ commentText: body.commentText, asin: body.asin }];

  return source.map((comment, index) => ({
    position: index + 1,
    commentText: comment?.commentText?.trim() ?? "",
    asin: comment?.asin?.trim().toUpperCase() || null,
  }));
}

function validateComments(comments: CommentInput[]) {
  for (const comment of comments) {
    if (comment.commentText.length > 10000) return "Comments must be 10,000 characters or less.";
    if (comment.asin && !ASIN_PATTERN.test(comment.asin)) return "ASINs must be 10 letters or numbers.";
  }
  return null;
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
        "id, posting_group_id, schedule_date, schedule_hour, post_body, comment_text, asin, status, posted_at, updated_at, deal_schedule_comments(id, position, comment_text, asin)",
      )
      .eq("user_id", user.id)
      .eq("schedule_date", date)
      .order("schedule_hour"),
  ]);

  if (groupsResult.error) return NextResponse.json({ error: groupsResult.error.message }, { status: 500 });
  if (itemsResult.error) return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });

  const items = (itemsResult.data || []).map((item) => ({
    ...item,
    deal_schedule_comments: [...(item.deal_schedule_comments || [])].sort((a, b) => a.position - b.position),
  }));

  return NextResponse.json({ groups: groupsResult.data || [], items });
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
    comments?: Array<{ commentText?: string; asin?: string | null }>;
    status?: ScheduleStatus;
  } | null;

  const postingGroupId = body?.postingGroupId;
  const scheduleDate = body?.scheduleDate;
  const scheduleHour = body?.scheduleHour;
  const postBody = body?.postBody?.trim() ?? "";
  const comments = normalizeComments(body || {});
  const status = body?.status;

  if (!postingGroupId || !UUID_PATTERN.test(postingGroupId)) {
    return NextResponse.json({ error: "Choose a valid posting group." }, { status: 400 });
  }
  if (!isScheduleDate(scheduleDate)) {
    return NextResponse.json({ error: "Use a valid schedule date." }, { status: 400 });
  }
  if (!Number.isInteger(scheduleHour) || scheduleHour! < SCHEDULE_START_HOUR || scheduleHour! > SCHEDULE_END_HOUR) {
    return NextResponse.json({ error: "Schedule hour must be between 7 AM and 7 PM." }, { status: 400 });
  }
  if (postBody.length > 10000) {
    return NextResponse.json({ error: "Post text must be 10,000 characters or less." }, { status: 400 });
  }
  const commentError = validateComments(comments);
  if (commentError) return NextResponse.json({ error: commentError }, { status: 400 });
  if (status !== "planned" && status !== "posted") {
    return NextResponse.json({ error: "Choose a valid schedule status." }, { status: 400 });
  }

  const admin = createAdminClient();
  const [groupResult, existingResult] = await Promise.all([
    admin
      .from("deal_posting_groups")
      .select("id, slug")
      .eq("id", postingGroupId)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("deal_schedule_items")
      .select("id, status, posted_at")
      .eq("user_id", user.id)
      .eq("posting_group_id", postingGroupId)
      .eq("schedule_date", scheduleDate)
      .eq("schedule_hour", scheduleHour!)
      .maybeSingle(),
  ]);

  if (groupResult.error) return NextResponse.json({ error: groupResult.error.message }, { status: 500 });
  if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  if (!groupResult.data) return NextResponse.json({ error: "Posting group not found." }, { status: 404 });

  const isRecurringSlot = Boolean(recurringDailySlot(groupResult.data.slug, scheduleHour!));
  const hasComments = comments.some((comment) => comment.commentText || comment.asin);

  if (!postBody && !hasComments && status === "planned" && !isRecurringSlot) {
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
  const firstComment = comments[0] || { commentText: "", asin: null };
  const { data: item, error } = await admin
    .from("deal_schedule_items")
    .upsert(
      {
        user_id: user.id,
        posting_group_id: postingGroupId,
        schedule_date: scheduleDate,
        schedule_hour: scheduleHour,
        post_body: postBody,
        comment_text: firstComment.commentText,
        asin: firstComment.asin,
        status,
        posted_at: status === "posted" ? existingResult.data?.posted_at || now : null,
        updated_at: now,
      },
      { onConflict: "user_id,posting_group_id,schedule_date,schedule_hour" },
    )
    .select("id, posting_group_id, schedule_date, schedule_hour, post_body, comment_text, asin, status, posted_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: deleteCommentsError } = await admin
    .from("deal_schedule_comments")
    .delete()
    .eq("schedule_item_id", item.id)
    .eq("user_id", user.id);
  if (deleteCommentsError) return NextResponse.json({ error: deleteCommentsError.message }, { status: 500 });

  const persistedComments = comments.filter((comment) => comment.commentText || comment.asin);
  if (persistedComments.length) {
    const { error: commentsError } = await admin.from("deal_schedule_comments").insert(
      persistedComments.map((comment) => ({
        schedule_item_id: item.id,
        user_id: user.id,
        position: comment.position,
        comment_text: comment.commentText,
        asin: comment.asin,
        updated_at: now,
      })),
    );
    if (commentsError) return NextResponse.json({ error: commentsError.message }, { status: 500 });
  }

  const wasPosted = existingResult.data?.status === "posted";

  if (status === "posted" && !wasPosted) {
    const firstSnapshot = await getPostSnapshot(admin, firstComment.asin);
    const { data: event, error: eventError } = await admin
      .from("deal_post_events")
      .insert({
        user_id: user.id,
        schedule_item_id: item.id,
        posting_group_id: postingGroupId,
        schedule_date: scheduleDate,
        schedule_hour: scheduleHour,
        asin: firstComment.asin,
        parent_asin: firstSnapshot?.parentAsin || null,
        product_title: firstSnapshot?.title || null,
        price_at_posting: firstSnapshot?.currentPrice ?? null,
        currency_code: firstSnapshot?.currentPrice != null ? "USD" : null,
        affiliate_url: firstSnapshot?.affiliateUrl || null,
        post_body: postBody,
        comment_text: firstComment.commentText,
        posted_at: item.posted_at || now,
      })
      .select("id")
      .single();

    if (eventError && eventError.code !== "23505") {
      await admin.from("deal_schedule_items").update({ status: "planned", posted_at: null, updated_at: now }).eq("id", item.id).eq("user_id", user.id);
      return NextResponse.json({ error: `Could not record the posting history: ${eventError.message}` }, { status: 500 });
    }

    if (event?.id && persistedComments.length) {
      const eventComments = await Promise.all(
        persistedComments.map(async (comment) => ({ comment, snapshot: await getPostSnapshot(admin, comment.asin) })),
      );
      const { error: eventCommentsError } = await admin.from("deal_post_event_comments").insert(
        eventComments.map(({ comment, snapshot }) => ({
          post_event_id: event.id,
          user_id: user.id,
          position: comment.position,
          comment_text: comment.commentText,
          asin: comment.asin,
          parent_asin: snapshot?.parentAsin || null,
          product_title: snapshot?.title || null,
          price_at_posting: snapshot?.currentPrice ?? null,
          currency_code: snapshot?.currentPrice != null ? "USD" : null,
          affiliate_url: snapshot?.affiliateUrl || null,
        })),
      );
      if (eventCommentsError) return NextResponse.json({ error: `Could not record comment history: ${eventCommentsError.message}` }, { status: 500 });
    }
  }

  if (status === "planned" && wasPosted && existingResult.data?.id) {
    const { error: voidError } = await admin
      .from("deal_post_events")
      .update({ voided_at: now, void_reason: "Posting status changed back to planned" })
      .eq("user_id", user.id)
      .eq("schedule_item_id", existingResult.data.id)
      .is("voided_at", null);

    if (voidError) {
      await admin.from("deal_schedule_items").update({ status: "posted", posted_at: existingResult.data.posted_at, updated_at: now }).eq("id", existingResult.data.id).eq("user_id", user.id);
      return NextResponse.json({ error: `Could not void the posting history: ${voidError.message}` }, { status: 500 });
    }
  }

  const { data: commentsData, error: commentsLoadError } = await admin
    .from("deal_schedule_comments")
    .select("id, position, comment_text, asin")
    .eq("schedule_item_id", item.id)
    .eq("user_id", user.id)
    .order("position");
  if (commentsLoadError) return NextResponse.json({ error: commentsLoadError.message }, { status: 500 });

  return NextResponse.json({ item: { ...item, deal_schedule_comments: commentsData || [] } });
}
