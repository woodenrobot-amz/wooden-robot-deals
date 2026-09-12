import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isScheduleDate } from "@/lib/deal-schedule";

const SOURCE_SLUG = "woodworking";
const TARGET_SLUG = "woodworking-page";
const GEMINI_MODEL = "gemini-3.5-flash-lite";

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

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const envelope = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (envelope.candidates?.[0]?.content?.parts || [])
    .map((part) => typeof part.text === "string" ? part.text.trim() : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

const REWRITE_INSTRUCTIONS = `Write a second Facebook post about the same woodworking deal. This is NOT a paraphrasing task. Ask yourself: "What is another thing the same person might naturally say about this same deal?"

VOICE:
- Casual, concise, conversational. Usually 1-2 short sentences.
- Sound like a woodworker talking to other woodworkers, not a marketer, reviewer, product expert, or social media manager.
- Dry humor, mild sarcasm, dumb jokes, self-deprecation, questions, and quick observations are welcome when the source gives you room for them.
- Do not force humor. A boring but natural 8-word post is better than a clever post based on something invented.
- Very short posts are fine.

FACTUAL BOUNDARIES — MOST IMPORTANT:
- Use ONLY information established by the source post.
- You may omit source information. You do not need to squeeze every fact into the alternate post.
- Never invent product specs, uses, quality, value, price history, comparisons, ownership, purchases, plans to purchase, projects, friends, customers, family, or firsthand experience.
- Personal experience may be reused ONLY when the source explicitly establishes it.
- Do not turn a possibility into a fact or purchase intent.
- If the source gives you very little information, WRITE LESS rather than filling in missing details.

MAKE IT DIFFERENT:
- Find a different angle, reaction, question, joke, or emphasis while staying inside the known facts.
- Do not mechanically replace words with synonyms or preserve the original sentence structure.
- A safe paraphrase is preferable to an entertaining hallucination when there is no strong alternate angle.

AVOID:
- Generic advice, educational filler, or polished marketing language.
- Phrases like "game-changer", "worth a look", "great addition to your workshop", "perfect for", "whether you're", "if you're looking to upgrade", "don't miss out", "deal alert", or "must have".
- Fake authority such as "I've found", "I've seen", "I've worked with", or "in my experience" unless the source explicitly establishes it.
- Emojis, hashtags, affiliate links, promo codes, ASINs, labels, explanations, or multiple options.

EXAMPLES:
Source: Makita 36V track saw. Lots to love on this option. Cords are okay, but cordless convenience is fantastic.
Alternate: Hard to go back to dragging a cord around once you've used a cordless track saw.

Source: Do you prefer the blade on the right or the left side of your circular saw?
Alternate: Circular saw blade left or blade right seems to be one of those debates nobody ever wins.

Source: 12pk of moving blankets. Maybe you've spent more than you should. The blankets will help you sleep better in your shop.
Alternate: At this price you can protect your tools AND build yourself a place to sleep when your wife sees the credit card bill.

Source: This carving set is a great price right now. It's good for wood and pumpkins.
Bad alternate: You can carve pumpkins, but I'm only buying it for the wood.
Why bad: The source never says the writer is buying it. Never make this kind of inference.

Return ONLY the finished alternate post.`;

async function rewritePostBody(sourceBody: string) {
  if (!sourceBody.trim()) return "";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is not configured for Page rewrites.");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: REWRITE_INSTRUCTIONS }] },
      contents: [{ role: "user", parts: [{ text: `SOURCE GROUP POST:\n${sourceBody}` }] }],
      generationConfig: {
        maxOutputTokens: 160,
        temperature: 0.75,
        thinkingConfig: { thinkingLevel: "minimal" },
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : null;
    throw new Error(message || `Gemini Page rewrite failed (${response.status}).`);
  }

  const rewritten = extractGeminiText(payload);
  if (!rewritten) throw new Error("Gemini returned an empty Page rewrite.");
  if (rewritten.length > 10000) throw new Error("Generated Page rewrite exceeded the post length limit.");
  return rewritten;
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { scheduleDate?: string } | null;
  const scheduleDate = body?.scheduleDate;
  if (!isScheduleDate(scheduleDate)) return NextResponse.json({ error: "Use a valid YYYY-MM-DD date." }, { status: 400 });

  const admin = createAdminClient();
  const { data: groups, error: groupsError } = await admin.from("deal_posting_groups").select("id, slug").in("slug", [SOURCE_SLUG, TARGET_SLUG]).eq("is_active", true);
  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });
  const sourceGroup = groups?.find((group) => group.slug === SOURCE_SLUG);
  const targetGroup = groups?.find((group) => group.slug === TARGET_SLUG);
  if (!sourceGroup || !targetGroup) return NextResponse.json({ error: "Woodworking Page planner is not configured yet." }, { status: 409 });

  const [{ data: sourceItems, error: sourceError }, { data: targetItems, error: targetError }] = await Promise.all([
    admin.from("deal_schedule_items").select("id, schedule_hour, schedule_position, post_body, comment_text, asin, deal_schedule_comments(position, comment_text, asin)").eq("user_id", user.id).eq("posting_group_id", sourceGroup.id).eq("schedule_date", scheduleDate).order("schedule_hour"),
    admin.from("deal_schedule_items").select("id, status").eq("user_id", user.id).eq("posting_group_id", targetGroup.id).eq("schedule_date", scheduleDate),
  ]);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if ((targetItems || []).some((item) => item.status === "posted")) return NextResponse.json({ error: "Page posts have already been marked Posted for this day. Posted items are protected; generation is locked." }, { status: 409 });

  const populated = (sourceItems || []).filter((item) => Boolean(item.post_body || item.comment_text || item.asin || item.deal_schedule_comments?.length));
  if (!populated.length) return NextResponse.json({ error: "There are no populated Woodworking posts to generate from." }, { status: 409 });

  let rewrittenBodies: string[];
  try {
    rewrittenBodies = await Promise.all(populated.map((item) => rewritePostBody(item.post_body || "")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate Page copy." }, { status: 502 });
  }

  const sourceHours = populated.map((item) => item.schedule_hour ?? item.schedule_position);
  const targetHours = shuffledDerangement(sourceHours);
  const now = new Date().toISOString();
  const existingIds = (targetItems || []).map((item) => item.id);
  if (existingIds.length) {
    const { error: commentsDeleteError } = await admin.from("deal_schedule_comments").delete().in("schedule_item_id", existingIds).eq("user_id", user.id);
    if (commentsDeleteError) return NextResponse.json({ error: commentsDeleteError.message }, { status: 500 });
  }
  const { error: deleteError } = await admin.from("deal_schedule_items").delete().eq("user_id", user.id).eq("posting_group_id", targetGroup.id).eq("schedule_date", scheduleDate);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const generated = populated.map((source, index) => {
    const comments = [...(source.deal_schedule_comments || [])].sort((a, b) => a.position - b.position);
    const firstComment = comments[0] || { position: 1, comment_text: source.comment_text || "", asin: source.asin || null };
    return { source, rewrittenBody: rewrittenBodies[index], comments, targetHour: targetHours[index], firstComment };
  });

  const { data: inserted, error: insertError } = await admin.from("deal_schedule_items").insert(generated.map(({ rewrittenBody, targetHour, firstComment }) => ({
    user_id: user.id, posting_group_id: targetGroup.id, schedule_date: scheduleDate, schedule_hour: targetHour, schedule_position: targetHour, post_body: rewrittenBody, comment_text: firstComment.comment_text, asin: firstComment.asin, status: "planned", posted_at: null, updated_at: now,
  }))).select("id, schedule_hour");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const insertedByHour = new Map((inserted || []).map((item) => [item.schedule_hour, item.id]));
  const commentsToInsert = generated.flatMap(({ source, comments, targetHour }) => {
    const scheduleItemId = insertedByHour.get(targetHour);
    if (!scheduleItemId) return [];
    const sourceComments = comments.length ? comments : source.comment_text || source.asin ? [{ position: 1, comment_text: source.comment_text || "", asin: source.asin || null }] : [];
    return sourceComments.map((comment) => ({ schedule_item_id: scheduleItemId, user_id: user.id, position: comment.position, comment_text: comment.comment_text, asin: comment.asin, updated_at: now }));
  });
  if (commentsToInsert.length) {
    const { error: commentsError } = await admin.from("deal_schedule_comments").insert(commentsToInsert);
    if (commentsError) return NextResponse.json({ error: commentsError.message }, { status: 500 });
  }

  return NextResponse.json({ generated: generated.length, mappings: generated.map(({ source, targetHour }) => ({ sourceHour: source.schedule_hour ?? source.schedule_position, targetHour })), bodyMode: "llm-rewritten", provider: "google-gemini", model: GEMINI_MODEL });
}
