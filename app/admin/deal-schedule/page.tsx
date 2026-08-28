import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealScheduleBoard } from "./deal-schedule-board";
import { UnplannedPostTracker } from "./unplanned-post-tracker";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateInEasternTime, isScheduleDate } from "@/lib/deal-schedule";
import { isAdminSurface } from "@/lib/app-surface";

export const metadata: Metadata = {
  title: "Deal Schedule",
  description: "Plan, copy, and track daily deal posts by group and time.",
  manifest: isAdminSurface ? "/manifest.webmanifest" : "/admin-schedule.webmanifest",
};

export default async function DealSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requestedDate = (await searchParams).date;
  const date = isScheduleDate(requestedDate) ? requestedDate : dateInEasternTime();
  const admin = createAdminClient();
  const [groupsResult, itemsResult] = await Promise.all([
    admin
      .from("deal_posting_groups")
      .select("id, name, slug, accent, sort_order, schedule_type, tracks_post_events")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    admin
      .from("deal_schedule_items")
      .select(
        "id, posting_group_id, schedule_date, schedule_hour, schedule_position, post_body, comment_text, asin, status, posted_at, updated_at, deal_schedule_comments(id, position, comment_text, asin)",
      )
      .eq("user_id", user.id)
      .eq("schedule_date", date)
      .order("schedule_position"),
  ]);

  if (groupsResult.error) throw new Error(`Failed to load posting groups: ${groupsResult.error.message}`);
  if (itemsResult.error) throw new Error(`Failed to load the deal schedule: ${itemsResult.error.message}`);

  const groups = groupsResult.data || [];
  const items = (itemsResult.data || []).map((item) => ({
    ...item,
    deal_schedule_comments: [...(item.deal_schedule_comments || [])].sort((a, b) => a.position - b.position),
  }));

  return (
    <main className="min-h-screen bg-[#090b10] px-3 pb-16 pt-4 text-white sm:px-5 sm:pt-7">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-semibold text-amber-300">
          ← Admin
        </Link>
        <UnplannedPostTracker />
        <DealScheduleBoard initialDate={date} initialGroups={groups} initialItems={items} />
      </div>
    </main>
  );
}
