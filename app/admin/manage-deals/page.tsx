import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDealList } from "../admin-deal-list";

export default async function ManageDealsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [{ data: deals }, { data: categories }] = await Promise.all([
    admin
      .from("deals")
      .select("id, asin, title, brand, category_id, deal_score, current_price, avg_90_price, image_url, status, source, created_at, expires_at, scoring_components")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("categories").select("id, name").order("name"),
  ]);

  const asins = (deals || []).map((deal) => deal.asin);
  const { data: candidates } = asins.length
    ? await admin
        .from("deal_candidates")
        .select("asin, stream_id, status, raw_data")
        .in("asin", asins)
        .order("created_at", { ascending: false })
    : { data: [] };
  const historyByAsin = new Map<string, typeof candidates>();
  for (const candidate of candidates || []) {
    historyByAsin.set(candidate.asin, [
      ...(historyByAsin.get(candidate.asin) || []),
      candidate,
    ]);
  }
  const dealsWithHistory = (deals || []).map((deal) => ({
    ...deal,
    candidate_history: historyByAsin.get(deal.asin) || [],
  }));

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm text-amber-400">← Back to Admin</Link>
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-widest text-amber-400">Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Editorial Controls</h1>
          <p className="mt-3 text-sm text-zinc-400">Edit presentation, control expiration, feature priority deals, and unpublish without ignoring an ASIN.</p>
        </div>
        <AdminDealList initialDeals={dealsWithHistory} categories={categories || []} />
      </div>
    </main>
  );
}
