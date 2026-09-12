import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isScheduleDate } from "@/lib/deal-schedule";

const SOURCE_SLUG = "woodworking";
const TARGET_SLUG = "woodworking-page";
const OPENAI_MODEL = process.env.OPENAI_PAGE_REWRITE_MODEL || "gpt-5.6-luna";

async function authenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function shuffledDerangement(hours: number[]) {
  if (hours.length < 2) return [...hours];
  const shuffled = [...hours];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text?.trim()) return response.output_text.trim();
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text!.trim())
    .join("\n")
    .trim();
}

async function rewritePostBody(sourceBody: string) {
  if (!sourceBody.trim()) return "";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for Page rewrites.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "none" },
      max_output_tokens: 180,
      instructions: `You write alternate Facebook Page copy for a woodworking-deals creator. The source is a post the same creator already wrote for a Facebook Group. Create another natural human reaction to the same deal rather than mechanically paraphrasing it.

Hard rules:
- Preserve every factual claim from the source. Never add product facts, prices, discounts, urgency, specifications, ownership, use, testing, recommendations, or personal history that the source does not establish.
- If the source says the creator owns, uses, tried, likes, dislikes, or experienced something, that personal fact may be retained. Otherwise never imply firsthand experience.
- Do not preserve the source sentence structure, hook, or wording unless a product name or necessary fact requires it.
- Match the spirit of the creator's writing. The result may be dry, sarcastic, playful, mildly suggestive, extremely short, conversational, or straightforward when that fits the source.
- Avoid ad copy. Never add generic enthusiasm, emojis, hashtags, calls to action, "deal alert" language, "upgrade your workshop," "don't miss out," or similar marketing filler.
- Do not include affiliate links, #ad disclosures, promo codes, ASINs, or comments. Those are handled separately and must never be generated here.
- Return only the finished Facebook post body. No quotation marks, labels, explanation, alternatives, or markdown.`,
      input: `SOURCE GROUP POST:\n${sourceBody}`,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : null;
    throw new Error(message || `OpenAI rewrite failed (${response.status}).`);
  }
  const rewritten = extractOutputText(payload);
  if (!rewritten) throw new Error("OpenAI returned an empty Page rewrite.");
  if (rewritten.length > 10000) throw new Error("Generated Page rewrite exceeded the post length limit.");
  return rewritten;
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

  let rewrittenBodies: string[];
  try {
    rewrittenBodies = await Promise.all(populated.map((item) => rewritePostBody(item.post_body || "")));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate Page copy." },
      { status: 502 },
    );
  }

  const sourceHours = populated.map((item) => item.schedule_hour ?? item.schedule_position);
  const targetHours = shuffledDerangement(sourceHours);
  const now = new Date().toISOString();

  // Do not delete the existing target plan until every rewrite succeeds.
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
      rewrittenBody: rewrittenBodies[index],
      comments,
      targetHour: targetHours[index],
      firstComment,
    };
  });

  const { data: inserted, error: insertError } = await admin
    .from("deal_schedule_items")
    .insert(
      generated.map(({ rewrittenBody, targetHour, firstComment }) => ({
        user_id: user.id,
        posting_group_id: targetGroup.id,
        schedule_date: scheduleDate,
        schedule_hour: targetHour,
        schedule_position: targetHour,
        post_body: rewrittenBody,
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
      // Protected path: comments never enter the LLM request and are copied verbatim.
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
    bodyMode: "llm-rewritten",
    model: OPENAI_MODEL,
  });
}
