import { supabase } from "@/lib/supabase";
import { DealsFeed } from "./deals-feed";

export default async function Home() {
  const { data: deals, error } = await supabase
    .from("deals")
    .select("*, categories(name)")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("deal_score", { ascending: false })
    .limit(50);

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
        As an Amazon Associate, Wooden Robot may earn from qualifying purchases.
      </footer>
    </main>
  );
}
