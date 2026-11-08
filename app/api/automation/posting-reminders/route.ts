import { timingSafeEqual } from "node:crypto";
import { generateRequestDetails } from "web-push";
import { isPushEndpoint, pushConfig } from "@/lib/posting-push";
import { createAdminClient } from "@/lib/supabase/admin";

type ClaimedReminder = {
  endpoint: string;
  p256dh: string;
  auth: string;
  posted_at: string;
  expires_at: string;
};

export async function POST(request: Request) {
  const secret = process.env.AUTOMATION_SECRET;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (!secret || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const vapidDetails = pushConfig();
  if (!vapidDetails) return Response.json({ error: "Push reminders are unavailable." }, { status: 503 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_posting_reminders");
  if (error) return Response.json({ error: "Could not claim reminders." }, { status: 500 });

  const results = await Promise.all((data as ClaimedReminder[]).map(async (reminder) => {
    const { endpoint, posted_at: postedAt, expires_at: expiresAt } = reminder;
    const ttl = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);
    if (ttl < 0 || !isPushEndpoint(endpoint)) return false;

    try {
      const message = generateRequestDetails(
        { endpoint, keys: { p256dh: reminder.p256dh, auth: reminder.auth } },
        JSON.stringify({ expiresAt }),
        { vapidDetails, TTL: ttl, urgency: "high", topic: "posting-desk" },
      );
      const response = await fetch(endpoint, {
        method: "POST",
        headers: message.headers as Record<string, string>,
        body: message.body ? new Uint8Array(message.body) : null,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) return true;
      if ([404, 410].includes(response.status)) {
        await admin.from("posting_push_subscriptions").delete()
          .eq("endpoint", endpoint).eq("notified_posted_at", postedAt);
        return false;
      }
      console.warn("Posting reminder rejected", response.status);
    } catch {
      console.warn("Posting reminder could not be sent");
    }

    await admin.from("posting_push_subscriptions").update({ notified_posted_at: null })
      .eq("endpoint", endpoint).eq("notified_posted_at", postedAt);
    return false;
  }));

  return Response.json({ sent: results.filter(Boolean).length });
}
