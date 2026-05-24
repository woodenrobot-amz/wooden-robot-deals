"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminDeal = {
  id: string;
  asin: string;
  title: string;
  brand: string | null;
  deal_score: number;
  current_price: number | null;
  avg_90_price: number | null;
  image_url: string | null;
  status: string;
};

export function AdminDealList({ initialDeals }: { initialDeals: AdminDeal[] }) {
  const supabase = createClient();
  const [deals, setDeals] = useState(initialDeals);
  const [message, setMessage] = useState("");

  async function killDeal(dealId: string) {
    const { error } = await supabase
      .from("deals")
      .update({ status: "killed" })
      .eq("id", dealId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setDeals((currentDeals) =>
      currentDeals.filter((deal) => deal.id !== dealId)
    );

    setMessage("Deal killed.");
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">Active Deals</h2>

      {message && (
        <p className="mt-3 text-sm text-zinc-300">
          {message}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {deals.map((deal) => (
          <div
            key={deal.id}
            className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"
          >
            {deal.image_url ? (
              <div className="h-20 w-20 shrink-0 rounded-lg bg-white p-2">
                <img
                  src={deal.image_url}
                  alt={deal.title}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xs text-zinc-500">
                No image
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="text-xs text-zinc-500">
                {deal.asin}
              </div>

              <h3 className="line-clamp-2 font-semibold">
                {deal.title}
              </h3>

              <p className="mt-1 text-sm text-zinc-400">
                {deal.brand || "Unknown brand"}
              </p>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                <span>Score: {deal.deal_score}</span>
                <span>Now: ${deal.current_price}</span>
                <span>90d: ${deal.avg_90_price}</span>
              </div>
            </div>

            <button
              onClick={() => killDeal(deal.id)}
              className="self-center rounded-xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300"
            >
              Kill
            </button>
          </div>
        ))}

        {deals.length === 0 && (
          <p className="text-sm text-zinc-500">
            No active deals.
          </p>
        )}
      </div>
    </section>
  );
}