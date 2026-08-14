import { createAdminClient } from "@/lib/supabase/admin";
import { DealsFeed } from "./deals-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const supabase = createAdminClient();
  const { data: deals, error } = await supabase
    .from("deals")
    .select("*, categories(name)")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .order("deal_score", { ascending: false })
    .limit(100);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-6">
          <p className="text-sm uppercase tracking-widest text-amber-400">
            Wooden Robot
          </p>
          <h1 className="text-3xl font-bold">Top Deals</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Curated deals for tools, garage, tech, EDC, and useful guy stuff.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            Error loading deals: {error.message}
          </div>
        )}

        <DealsFeed deals={deals || []} />
      </div>
      <footer className="mx-auto max-w-3xl px-4 pb-6 text-xs text-zinc-500">
        <p>
          As an Amazon Associate, Wooden Robot earns from qualifying purchases.
        </p>
        <p className="mt-2">
          Prices and availability are subject to change. Any price and
          availability information displayed on Amazon at the time of purchase
          will apply to the purchase of this product.
        </p>
        <p className="mt-2 uppercase">
          Certain content that appears on this site comes from Amazon. This
          content is provided “as is” and is subject to change or removal at any
          time.
        </p>
      </footer>
    </main>
  );
}
