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

  scoring_components: {
    baseScore: number;
    brandScore: number;
    demandScore: number;
    discountScore: number;
    confidenceScore: number;
    discountPercent: number;
  } | null;
};

export function AdminDealList({ initialDeals }: { initialDeals: AdminDeal[] }) {
  const supabase = createClient();
  const [deals, setDeals] = useState(initialDeals);
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function refreshDeals() {
    setRefreshing(true);
    setMessage("");

    const response = await fetch("/api/admin/refresh-deals", {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Failed to refresh deals.");
      setRefreshing(false);
      return;
    }

    setDeals((currentDeals) =>
      currentDeals.map((deal) => {
        const refreshedDeal = data.deals.find(
          (item: { id: string }) => item.id === deal.id,
        );

        if (!refreshedDeal) return deal;

        return {
          ...deal,
          current_price: refreshedDeal.current_price,
          deal_score: refreshedDeal.deal_score,
          scoring_components: refreshedDeal.scoring_components,
        };
      }),
    );

    setMessage(`Refreshed ${data.refreshed} deal(s). Skipped ${data.skipped}.`);

    setRefreshing(false);
  }

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
      currentDeals.filter((deal) => deal.id !== dealId),
    );

    setMessage("Deal killed.");
  }

  async function ignoreDeal(deal: AdminDeal) {
    const normalizedAsin = deal.asin.trim().toUpperCase();

    const { error: ignoreError } = await supabase.from("ignored_asins").upsert({
      asin: normalizedAsin,
      title: deal.title,
      brand: deal.brand,
      image_url: deal.image_url,
      reason: "Ignored from active deals",
    });

    if (ignoreError) {
      setMessage(ignoreError.message);
      return;
    }

    const { error: dealError } = await supabase
      .from("deals")
      .update({ status: "killed" })
      .eq("id", deal.id);

    if (dealError) {
      setMessage(dealError.message);
      return;
    }

    setDeals((currentDeals) =>
      currentDeals.filter((currentDeal) => currentDeal.id !== deal.id),
    );

    setMessage(`ASIN ${normalizedAsin} ignored and deal killed.`);
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">Active Deals</h2>

      <button
        onClick={refreshDeals}
        disabled={refreshing}
        className="mt-3 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
      >
        {refreshing ? "Refreshing..." : "Refresh Prices"}
      </button>

      {message && <p className="mt-3 text-sm text-zinc-300">{message}</p>}

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
              <div className="text-xs text-zinc-500">{deal.asin}</div>

              <h3 className="line-clamp-2 font-semibold">{deal.title}</h3>

              <p className="mt-1 text-sm text-zinc-400">
                {deal.brand || "Unknown brand"}
              </p>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                <span>Score: {deal.deal_score}</span>
                <span>Now: ${deal.current_price}</span>
                <span>90d: ${deal.avg_90_price}</span>
                <span>
                  {deal.scoring_components?.discountPercent != null && (
                    <span>
                      Discount: {deal.scoring_components.discountPercent}%
                    </span>
                  )}
                </span>
              </div>
              {deal.scoring_components && (
                <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
                  <div className="mb-2 font-semibold text-zinc-200">
                    Score Breakdown
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <span>Base: +{deal.scoring_components.baseScore}</span>
                    <span>
                      Discount: +{deal.scoring_components.discountScore}
                    </span>
                    <span>Brand: +{deal.scoring_components.brandScore}</span>
                    <span>Demand: +{deal.scoring_components.demandScore}</span>
                    <span>
                      Confidence: +{deal.scoring_components.confidenceScore}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 self-center">
              <button
                onClick={() => killDeal(deal.id)}
                className="self-center rounded-xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300"
              >
                Kill
              </button>

              <button
                onClick={() => ignoreDeal(deal)}
                className="self-center rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-300"
              >
                Ignore
              </button>
            </div>
          </div>
        ))}

        {deals.length === 0 && (
          <p className="text-sm text-zinc-500">No active deals.</p>
        )}
      </div>
    </section>
  );
}
