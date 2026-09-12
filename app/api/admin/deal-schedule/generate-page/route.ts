import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isScheduleDate } from "@/lib/deal-schedule";

const SOURCE_SLUG = "woodworking";
const TARGET_SLUG = "woodworking-page";
const CLOUDFLARE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

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

function extractCloudflareText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const envelope = payload as { result?: { response?: string; choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> }; choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };
  const result = envelope.result;
  if (typeof result?.response === "string" && result.response.trim()) return result.response.trim();
  const choices = result?.choices || envelope.choices || [];
  const content = choices[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text!.trim()).filter(Boolean).join("\n").trim();
  return "";
}

function cloudflareEmptyReason(payload: unknown) {
  if (!payload || typeof payload !== "object") return "unknown response shape";
  const envelope = payload as { result?: { choices?: Array<{ finish_reason?: string; message?: { reasoning_content?: string } }> }; choices?: Array<{ finish_reason?: string; message?: { reasoning_content?: string } }> };
  const choice = (envelope.result?.choices || envelope.choices || [])[0];
  const details = [choice?.finish_reason ? `finish_reason=${choice.finish_reason}` : null, choice?.message?.reasoning_content ? `reasoning_chars=${choice.message.reasoning_content.length}` : null].filter(Boolean);
  return details.length ? details.join(", ") : "no text content in response";
}

const REWRITE_INSTRUCTIONS = `Write a second Facebook post about the same woodworking deal. It should sound like the same person had another quick thought about the deal, NOT like an AI rewrote the first post.

VOICE:
- Casual, concise, conversational. Usually 1-3 short sentences.
- Dry humor, sarcasm, teasing, wordplay, mild innuendo, or an intentionally dumb joke are welcome when the source gives you room for it.
- Sometimes the best post is just a short observation or question.
- Straightforward deal copy is also fine. Do not force a joke into every post.
- Sound like a woodworker talking to other woodworkers, not a marketer, reviewer, product expert, or how-to article.

MOST IMPORTANT RULE: DO NOT MAKE THINGS UP.
- Use ONLY facts and personal experience explicitly stated in the source post.
- Never invent having owned, used, tested, seen, installed, compared, or worked with anything.
- Never invent a project, friend, customer, house, shop situation, product capability, use case, specification, price history, performance claim, or recommendation.
- Do not turn a possibility into a fact. If the source says something might/could work, keep that uncertainty.
- If there is not enough information for a detailed alternate post, WRITE LESS. A five-word reaction is better than filling in missing details.

HOW TO MAKE IT DIFFERENT:
- Find a different angle, reaction, joke, question, or emphasis using the SAME known information.
- Do not mechanically paraphrase sentence-by-sentence.
- Do not explain the product unless the source explains it.
- Preserve important deal facts when useful, but you do not have to repeat every fact.
- Personal facts may be reused only when explicitly present in the source.

AVOID:
- Generic advice or educational filler.
- Polished marketing language.
- Phrases like "game-changer", "make all the difference", "great addition to your workshop", "perfect for", "whether you're", "if you're looking to upgrade", "don't miss out", or "deal alert".
- Fake authority such as "I've found", "I've seen", "I've worked with", or "in my experience" unless the source explicitly establishes it.
- Emojis, hashtags, affiliate links, promo codes, ASINs, labels, explanations, or multiple options.

GOOD EXAMPLES OF THE VOICE:
Source: Makita 36V track saw. Lots to love on this option. Cords are okay, but cordless convenience is fantastic.
Alternate: Cordless track saws like this Makita 36V model make you wonder why you ever bothered with cords in the first place.

Source: 12pk of moving blankets. Maybe you've spent more than you should. The blankets will help you sleep better in your shop.
Alternate: At this price you can protect your tools AND build yourself a place to sleep when your wife sees the credit card bill.

Source: If you're looking to move to a larger dust collector, this one might be it. 2HP with a cyclone built in. This one probably sucks.
Alternate: 2HP. Cyclone. Hopefully it sucks as much as it should.

Source: If you have 7-9 identical drills, this tool organizer is for you... Okay, you don't really need 7-9 drills, but I like a lot about this one.
Alternate: Nobody needs 9 drills. That doesn't mean you can't organize them like you do.

Source: This protractor goes on sale about once a month. It's that time of the month.
Alternate: Monthly protractor sale. Make your own joke here, I'm staying out of it.

Source: Parallel clamps. 36\". 2200lb of clamping force. Enough said.
Alternate: 2200lb of clamping force. Your glue-up has been warned.

Source: Do you prefer the blade on the right or the left side of your circular saw?
Alternate: Blade left or blade right? Apparently woodworkers need another thing to disagree about.

Return ONLY the finished alternate post.`;

async function rewritePostBody(sourceBody: string) {
  if (!sourceBody.trim()) return "";
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured for Page rewrites.");
  const modelPath = CLOUDFLARE_MODEL.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${modelPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "system", content: REWRITE_INSTRUCTIONS }, { role: "user", content: `SOURCE GROUP POST:\n${sourceBody}` }],
      max_tokens: 160,
      temperature: 0.75,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "errors" in payload ? (payload as { errors?: Array<{ message?: string }> }).errors?.map((error) => error.message).filter(Boolean).join("; ") : null;
    throw new Error(message || `Cloudflare Workers AI rewrite failed (${response.status}).`);
  }
  const rewritten = extractCloudflareText(payload);
  if (!rewritten) throw new Error(`Cloudflare Workers AI returned an empty Page rewrite (${cloudflareEmptyReason(payload)}).`);
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

  return NextResponse.json({ generated: generated.length, mappings: generated.map(({ source, targetHour }) => ({ sourceHour: source.schedule_hour ?? source.schedule_position, targetHour })), bodyMode: "llm-rewritten", provider: "cloudflare-workers-ai", model: CLOUDFLARE_MODEL });
}
