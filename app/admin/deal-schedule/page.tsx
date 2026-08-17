import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealScheduleBoard } from "./deal-schedule-board";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateInEasternTime, isScheduleDate } from "@/lib/deal-schedule";
import { isAdminSurface } from "@/lib/app-surface";

export const metadata: Metadata = {
  title: "Deal Schedule",
  description: "Plan and copy daily deal posts by group and time.",
  manifest: isAdminSurface
    ? "/manifest.webmanifest"
    : "/admin-schedule.webmanifest",
};

export default async function DealSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requestedDate = (await searchParams).date;
  const date = isScheduleDate(requestedDate) ? requestedDate : dateInEasternTime();
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
    throw new Error(`Failed to load posting groups: ${groupsResult.error.message}`);
  }
  if (itemsResult.error) {
    throw new Error(`Failed to load the deal schedule: ${itemsResult.error.message}`);
  }

  return (
    <main className="min-h-screen bg-[#090b10] px-3 pb-16 pt-4 text-white sm:px-5 sm:pt-7">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-semibold text-amber-300">
          ← Admin
        </Link>
        <DealScheduleBoard
          initialDate={date}
          initialGroups={groupsResult.data || []}
          initialItems={itemsResult.data || []}
        />
      </div>
    </main>
  );
}
