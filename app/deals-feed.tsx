"use client";

import { useEffect, useState } from "react";

type Deal = {
  id: string;
  asin: string;
  title: string;
  brand: string | null;
  brand_tier: string | null;
  category_id: string | null;
  current_price: number | null;
  deal_score: number;
  badges: string[];
  amazon_url: string | null;
  image_url: string | null;
  expires_at: string;
  scoring_components?: {
    lifecycle?: {
      checkedAt?: string;
    };
  } | null;
  categories?: {
    name: string;
  } | null;
};

function getAmazonFreshnessText(checkedAt?: string) {
  if (!checkedAt) return "Amazon price refresh pending";

  return `Amazon price as of ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(checkedAt))}`;
}

function getExpirationText(expiresAt: string) {
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();

  const diffMs = expires - now;

  if (diffMs <= 0) return "Expired";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours < 24) {
    return `Expires in ${hours}h`;
  }

  const days = Math.floor(hours / 24);

  return `Expires in ${days}d`;
}

const HIDDEN_DEALS_KEY = "woodenRobot.hiddenDeals.v1";

export function DealsFeed({ deals }: { deals: Deal[] }) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [hiddenDealIds, setHiddenDealIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(HIDDEN_DEALS_KEY);

    if (saved) {
      queueMicrotask(() => {
        try {
          const parsed: unknown = JSON.parse(saved);
          setHiddenDealIds(
            Array.isArray(parsed)
              ? parsed.filter((value): value is string => typeof value === "string")
              : [],
          );
        } catch {
          window.localStorage.removeItem(HIDDEN_DEALS_KEY);
        }
      });
    }
  }, []);

  function hideDeal(dealId: string) {
    const nextHiddenDealIds = [...hiddenDealIds, dealId];

    setHiddenDealIds(nextHiddenDealIds);
    window.localStorage.setItem(
      HIDDEN_DEALS_KEY,
      JSON.stringify(nextHiddenDealIds),
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
      ]),
    ),
  );

  const filteredDeals = deals.filter((deal) => {
    if (hiddenDealIds.includes(deal.id)) return false;

    const matchesCategory =
      selectedCategory === "all" || deal.category_id === selectedCategory;

    const searchText =
      `${deal.title} ${deal.brand || ""} ${deal.asin}`.toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const publicBadges = ["Top Brand", "Huge Discount", "All Time Low"];

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
                  {deal.badges
                    ?.filter((badge) => publicBadges.includes(badge))
                    .slice(0, 3)
                    .map((badge) => (
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

              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="pl-1 text-left">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                    Expires
                  </div>

                  <div className="text-sm font-medium text-zinc-400">
                    {getExpirationText(deal.expires_at).replace(
                      "Expires in ",
                      "",
                    )}
                  </div>
                </div>

                <div
                  className={`shrink-0 rounded-2xl px-5 py-3 text-center shadow-lg ${
                    deal.deal_score >= 90
                      ? "bg-green-400 text-zinc-950"
                      : deal.deal_score >= 75
                        ? "bg-amber-400 text-zinc-950"
                        : "bg-zinc-700 text-white"
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                    Deal
                  </div>

                  <div className="text-3xl font-black leading-none">
                    {deal.deal_score}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-zinc-950 p-3 text-sm">
              <div className="text-zinc-500">Current Price</div>
              <div className="text-xl font-bold text-white">
                {deal.current_price != null
                  ? `$${deal.current_price}`
                  : "Check Amazon"}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {getAmazonFreshnessText(
                  deal.scoring_components?.lifecycle?.checkedAt,
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Price and availability may change. Final price is shown on
                Amazon.
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <a
                href={deal.amazon_url || "#"}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-zinc-950"
              >
                View Deal
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
