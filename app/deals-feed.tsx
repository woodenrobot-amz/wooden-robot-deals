"use client";

import { useEffect, useState } from "react";

type Deal = {
  id: string;
  asin: string;
  title: string;
  brand: string | null;
  category_id: string | null;
  current_price: number | null;
  avg_90_price: number | null;
  deal_score: number;
  badges: string[];
  amazon_url: string | null;
  image_url: string | null;
  categories?: {
    name: string;
  } | null;
};

const HIDDEN_DEALS_KEY = "woodenRobot.hiddenDeals.v1";

export function DealsFeed({ deals }: { deals: Deal[] }) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [hiddenDealIds, setHiddenDealIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(HIDDEN_DEALS_KEY);

    if (saved) {
      setHiddenDealIds(JSON.parse(saved));
    }
  }, []);

  function hideDeal(dealId: string) {
    const nextHiddenDealIds = [...hiddenDealIds, dealId];

    setHiddenDealIds(nextHiddenDealIds);
    window.localStorage.setItem(
      HIDDEN_DEALS_KEY,
      JSON.stringify(nextHiddenDealIds)
    );
  }

  function resetHiddenDeals() {
    setHiddenDealIds([]);
    window.localStorage.removeItem(HIDDEN_DEALS_KEY);
  }

  const categories = Array.from(
    new Map(
      deals.map((deal) => [
        deal.category_id || "uncategorized",
        deal.categories?.name || deal.category_id || "Uncategorized",
      ])
    )
  );

  const filteredDeals = deals.filter((deal) => {
    if (hiddenDealIds.includes(deal.id)) return false;

    const matchesCategory =
      selectedCategory === "all" || deal.category_id === selectedCategory;

    const searchText = `${deal.title} ${deal.brand || ""} ${deal.asin}`.toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  return (
    <>
      <div className="mb-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search deals, brands, or ASINs..."
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
            selectedCategory === "all"
              ? "bg-amber-400 text-zinc-950"
              : "bg-zinc-900 text-zinc-300"
          }`}
        >
          All
        </button>

        {categories.map(([id, name]) => (
          <button
            key={id}
            onClick={() => setSelectedCategory(id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              selectedCategory === id
                ? "bg-amber-400 text-zinc-950"
                : "bg-zinc-900 text-zinc-300"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-zinc-500">
        <div>
          Showing {filteredDeals.length} deal
          {filteredDeals.length === 1 ? "" : "s"}
        </div>

        {hiddenDealIds.length > 0 && (
          <button
            onClick={resetHiddenDeals}
            className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-300"
          >
            Restore hidden ({hiddenDealIds.length})
          </button>
        )}
      </div>

      <div className="space-y-4">
        {filteredDeals.map((deal) => (
          <article
            key={deal.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-lg"
          >
	{deal.image_url && (
  	  <div className="mb-4 rounded-xl bg-white p-3">
      		<img
     			 src={deal.image_url}
     			 alt={deal.title}
      			className="mx-auto h-48 w-full object-contain"
    		/>
 	 </div>
	)}

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  {deal.badges?.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300"
                    >
                      {badge}
                    </span>
                  ))}
                </div>

                <h2 className="text-lg font-semibold leading-snug">
                  {deal.title}
                </h2>

                <p className="mt-1 text-sm text-zinc-400">
                  {deal.brand || "Unknown brand"}
                </p>

                <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                  {deal.categories?.name || deal.category_id}
                </p>
              </div>

              <div className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-center text-zinc-950">
                <div className="text-xs font-semibold uppercase">Score</div>
                <div className="text-2xl font-black">{deal.deal_score}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-zinc-500">Current Price</div>
                <div className="text-xl font-bold text-white">
                  ${deal.current_price}
                </div>
              </div>

              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-zinc-500">90 Day Avg</div>
                <div className="text-xl font-bold text-zinc-300">
                  ${deal.avg_90_price}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
  <a
    href={deal.amazon_url || "#"}
    target="_blank"
    rel="noreferrer"
    className="rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-zinc-950"
  >
    Amazon
  </a>

  <button
    onClick={() => navigator.clipboard.writeText(deal.asin)}
    className="rounded-xl bg-zinc-800 px-4 py-3 text-sm font-bold text-zinc-300"
  >
    Copy ASIN
  </button>

  <a
    href={`https://keepa.com/#!product/1-${deal.asin}`}
    target="_blank"
    rel="noreferrer"
    className="rounded-xl bg-zinc-800 px-4 py-3 text-center text-sm font-bold text-zinc-300"
  >
    Keepa
  </a>

  <button
    onClick={() => hideDeal(deal.id)}
    className="rounded-xl bg-zinc-800 px-4 py-3 text-sm font-bold text-zinc-300"
  >
    Hide
  </button>
</div>
          </article>
        ))}
      </div>
    </>
  );
}