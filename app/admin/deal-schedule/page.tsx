import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dateInEasternTime, type PostingGroup, type ScheduleItem } from "@/lib/deal-schedule";
import { DealScheduleBoard } from "./deal-schedule-board";

export const dynamic = "force-dynamic";

export default async function DealSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const params = await searchParams;
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "")
    ? params.date!
    : dateInEasternTime();

  const [{ data: groups, error: groupsError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("posting_groups")
      .select("id, slug, name, schedule_type, accent, sort_order, active, tracks_post_events")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("deal_schedule_items")
      .select("*, deal_schedule_comments(*)")
      .eq("schedule_date", selectedDate)
      .order("schedule_position", { ascending: true }),
  ]);

  if (groupsError || itemsError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-zinc-100 sm:px-6">
        <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-5 text-sm text-red-200">
          Could not load Posting Desk. {groupsError?.message || itemsError?.message}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-3 pb-24 pt-4 text-zinc-100 sm:px-6 sm:pt-6">
      <DealScheduleBoard
        initialDate={selectedDate}
        initialGroups={(groups || []) as PostingGroup[]}
        initialItems={(items || []) as ScheduleItem[]}
      />
    </main>
  );
}
