import { isPushEndpoint, pushConfig } from "@/lib/posting-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("deal_schedule_items")
    .select("posted_at")
    .eq("user_id", user.id)
    .eq("status", "posted")
    .not("posted_at", "is", null)
    .order("posted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: "Could not load the reminder timer." }, { status: 500 });
  return Response.json({ postedAt: data?.posted_at ?? null, publicKey: pushConfig()?.publicKey ?? null });
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
