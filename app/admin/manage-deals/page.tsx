import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminDealList } from "../admin-deal-list";

export default async function ManageDealsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: deals } = await supabase
    .from("deals")
    .select(
      `
        id,
        asin,
        title,
        brand,
        deal_score,
        current_price,
        avg_90_price,
        image_url,
        status,
        scoring_components
      `,
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="text-sm text-amber-400">
          ← Back to Admin
        </Link>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-widest text-amber-400">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold">Manage Deals</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Review active deals, score breakdowns, and kill bad deals.
          </p>
        </div>

        <AdminDealList initialDeals={deals || []} />
      </div>
    </main>
  );
}
