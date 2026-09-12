import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isScheduleDate } from "@/lib/deal-schedule";

const SOURCE_SLUG = "woodworking";
const TARGET_SLUG = "woodworking-page";

async function authenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function shuffledDerangement(hours: number[]) {
  if (hours.length < 2) return [...hours];

  // Sattolo's algorithm creates one cycle, so no hour maps to itself.
  const shuffled = [...hours];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { scheduleDate?: string } | null;
  const scheduleDate = body?.scheduleDate;
  if (!isScheduleDate(scheduleDate)) {
    return NextResponse.json({ error: "Use a valid YYYY-MM-DD date." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: groups, error: groupsError } = await admin
    .from("deal_posting_groups")
    .select("id, slug")
    .in("slug", [SOURCE_SLUG, TARGET_SLUG])
    .eq("is_active", true);
  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });

  const sourceGroup = groups?.find((group) => group.slug === SOURCE_SLUG);
  const targetGroup = groups?.find((group) => group.slug === TARGET_SLUG);
  if (!sourceGroup || !targetGroup) {
    return NextResponse.json({ error: "Woodworking Page planner is not configured yet." }, { status: 409 });
  }

  const [{ data: sourceItems, error: sourceError }, { data: targetItems, error: targetError }] = await Promise.all([
    admin
      .from("deal_schedule_items")
      .select("id, schedule_hour, schedule_position, post_body, comment_text, asin, deal_schedule_comments(position, comment_text, asin)")
      .eq("user_id", user.id)
      .eq("posting_group_id", sourceGroup.id)
      .eq("schedule_date", scheduleDate)
      .order("schedule_hour"),
    admin
      .from("deal_schedule_items")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("posting_group_id", targetGroup.id)
      .eq("schedule_date", scheduleDate),
  ]);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });

  if ((targetItems || []).some((item) => item.status === "posted")) {
    return NextResponse.json(
      { error: "Page posts have already been marked Posted for this day. Posted items are protected; generation is locked." },
      { status: 409 },
    );
  }

  const populated = (sourceItems || []).filter((item) =>
    Boolean(item.post_body || item.comment_text || item.asin || item.deal_schedule_comments?.length),
  );
  if (!populated.length) {
    return NextResponse.json({ error: "There are no populated Woodworking posts to generate from." }, { status: 409 });
  }

  const sourceHours = populated.map((item) => item.schedule_hour ?? item.schedule_position);
  const targetHours = shuffledDerangement(sourceHours);
  const now = new Date().toISOString();

  // Regeneration is safe until posting begins: replace only the target day's unposted plan.
  const existingIds = (targetItems || []).map((item) => item.id);
  if (existingIds.length) {
    const { error: commentsDeleteError } = await admin
      .from("deal_schedule_comments")
      .delete()
      .in("schedule_item_id", existingIds)
      .eq("user_id", user.id);
    if (commentsDeleteError) return NextResponse.json({ error: commentsDeleteError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("deal_schedule_items")
    .delete()
    .eq("user_id", user.id)
    .eq("posting_group_id", targetGroup.id)
    .eq("schedule_date", scheduleDate);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const generated = populated.map((source, index) => {
    const comments = [...(source.deal_schedule_comments || [])].sort((a, b) => a.position - b.position);
    const firstComment = comments[0] || {
      position: 1,
      comment_text: source.comment_text || "",
      asin: source.asin || null,
    };
    return {
      source,
      comments,
      targetHour: targetHours[index],
      firstComment,
    };
  });

  const { data: inserted, error: insertError } = await admin
    .from("deal_schedule_items")
    .insert(
      generated.map(({ source, targetHour, firstComment }) => ({
        user_id: user.id,
        posting_group_id: targetGroup.id,
        schedule_date: scheduleDate,
        schedule_hour: targetHour,
        schedule_position: targetHour,
        // Phase 1: copy body verbatim. LLM rewriting will replace only this field later.
        post_body: source.post_body,
        comment_text: firstComment.comment_text,
        asin: firstComment.asin,
        status: "planned",
        posted_at: null,
        updated_at: now,
      })),
    )
    .select("id, schedule_hour");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const insertedByHour = new Map((inserted || []).map((item) => [item.schedule_hour, item.id]));
  const commentsToInsert = generated.flatMap(({ source, comments, targetHour }) => {
    const scheduleItemId = insertedByHour.get(targetHour);
    if (!scheduleItemId) return [];
    const sourceComments = comments.length
      ? comments
      : source.comment_text || source.asin
        ? [{ position: 1, comment_text: source.comment_text || "", asin: source.asin || null }]
        : [];
    return sourceComments.map((comment) => ({
      schedule_item_id: scheduleItemId,
      user_id: user.id,
      position: comment.position,
      // Intentionally copied exactly. Links, #ad, promo codes, spacing, and wording are protected.
      comment_text: comment.comment_text,
      asin: comment.asin,
      updated_at: now,
    }));
  });

  if (commentsToInsert.length) {
    const { error: commentsError } = await admin.from("deal_schedule_comments").insert(commentsToInsert);
    if (commentsError) return NextResponse.json({ error: commentsError.message }, { status: 500 });
  }

  return NextResponse.json({
    generated: generated.length,
    mappings: generated.map(({ source, targetHour }) => ({
      sourceHour: source.schedule_hour ?? source.schedule_position,
      targetHour,
    })),
    bodyMode: "copied-for-phase-1",
  });
}
