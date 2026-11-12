import { DEFAULT_REMINDER_TIMES, normalizeReminderTimes } from "@/lib/posting-reminder";
import { isPushEndpoint, pushConfig } from "@/lib/posting-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("posting_reminder_settings")
    .select("times").eq("user_id", user.id).maybeSingle();
  if (error) return Response.json({ error: "Could not load the reminder schedule." }, { status: 500 });
  return Response.json({ times: data?.times ?? DEFAULT_REMINDER_TIMES, publicKey: pushConfig()?.publicKey ?? null });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const times = normalizeReminderTimes(body?.times);
  if (!times) return Response.json({ error: "Use up to 48 valid times in HH:MM format." }, { status: 400 });
  const { error } = await supabase.from("posting_reminder_settings")
    .upsert({ user_id: user.id, times, updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: "Could not save the reminder schedule." }, { status: 500 });
  return Response.json({ times });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfig()) return Response.json({ error: "Push reminders are unavailable." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const { endpoint, keys, timeZone } = body ?? {};
  if (!isPushEndpoint(endpoint) ||
      typeof keys?.p256dh !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh) ||
      typeof keys?.auth !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth) ||
      typeof timeZone !== "string" || !/^[A-Za-z0-9_+/-]{1,80}$/.test(timeZone)) {
    return Response.json({ error: "Invalid browser subscription." }, { status: 400 });
  }
  let zone: string;
  try {
    zone = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    return Response.json({ error: "Invalid local time zone." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("posting_push_subscriptions").upsert({
    endpoint, user_id: user.id, p256dh: keys.p256dh, auth: keys.auth, time_zone: zone,
  });
  if (error) return Response.json({ error: "Could not register this device." }, { status: 500 });
  return Response.json({ enabled: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isPushEndpoint(body?.endpoint)) {
    return Response.json({ error: "Invalid browser subscription." }, { status: 400 });
  }
  const { error } = await createAdminClient().from("posting_push_subscriptions")
    .delete().eq("user_id", user.id).eq("endpoint", body.endpoint);
  if (error) return Response.json({ error: "Could not disable reminders." }, { status: 500 });
  return Response.json({ enabled: false });
}
