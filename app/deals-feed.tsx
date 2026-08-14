"use client";

import { useEffect, useMemo, useState } from "react";

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
  created_at: string;
  expires_at: string;
  scoring_components?: {
    discountPercent?: number;
    lifecycle?: { checkedAt?: string };
    editorial?: { featured?: boolean };
  } | null;
  categories?: { name: string } | null;
};

type SortOption = "newest" | "score" | "discount";

const HIDDEN_DEALS_KEY = "woodenRobot.hiddenDeals.v1";
const SAVED_DEALS_KEY = "woodenRobot.savedDeals.v1";
const publicBadges = ["Top Brand", "Huge Discount", "All Time Low"];

function readStoredIds(key: string) {
  const saved = window.localStorage.getItem(key);
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    window.localStorage.removeItem(key);
    return [];
  }
}

function formatPrice(price: number | null) {
  if (price == null) return "Check Amazon";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

function formatPublished(createdAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: new Date(createdAt).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(createdAt));
}

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

function getTiming(expiresAt: string) {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return { text: "Expired", urgent: true };
  const hours = Math.ceil(diffMs / 3_600_000);
  if (hours <= 6) return { text: `Ends in ${hours}h`, urgent: true };
  if (hours < 24) return { text: `Ends today · ${hours}h left`, urgent: true };
  const days = Math.ceil(hours / 24);
  return { text: `Ends in ${days} day${days === 1 ? "" : "s"}`, urgent: false };
}

function isRecent(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() <= 24 * 3_600_000;
}

export function DealsFeed({ deals }: { deals: Deal[] }) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [view, setView] = useState<"all" | "saved">("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [search, setSearch] = useState("");
  const [hiddenDealIds, setHiddenDealIds] = useState<string[]>([]);
  const [savedDealIds, setSavedDealIds] = useState<string[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      setHiddenDealIds(readStoredIds(HIDDEN_DEALS_KEY));
      setSavedDealIds(readStoredIds(SAVED_DEALS_KEY));
    });
  }, []);

  const categories = useMemo(
    () =>
      Array.from(
        new Map(
          deals.map((deal) => [
            deal.category_id || "uncategorized",
            deal.categories?.name || deal.category_id || "Uncategorized",
          ]),
        ),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [deals],
  );

  const visibleDeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deals
      .filter((deal) => {
        if (hiddenDealIds.includes(deal.id)) return false;
        if (view === "saved" && !savedDealIds.includes(deal.id)) return false;
        if (selectedCategory !== "all" && deal.category_id !== selectedCategory) return false;
        return !query || `${deal.title} ${deal.brand || ""} ${deal.asin}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const featureOrder = Number(b.scoring_components?.editorial?.featured === true) - Number(a.scoring_components?.editorial?.featured === true);
        if (featureOrder) return featureOrder;
        if (sort === "score") return b.deal_score - a.deal_score;
        if (sort === "discount") {
          return (b.scoring_components?.discountPercent || 0) - (a.scoring_components?.discountPercent || 0);
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [deals, hiddenDealIds, savedDealIds, search, selectedCategory, sort, view]);

  function hideDeal(dealId: string) {
    const next = Array.from(new Set([...hiddenDealIds, dealId]));
    setHiddenDealIds(next);
    window.localStorage.setItem(HIDDEN_DEALS_KEY, JSON.stringify(next));
  }

  function toggleSaved(dealId: string) {
    const next = savedDealIds.includes(dealId)
      ? savedDealIds.filter((id) => id !== dealId)
      : [...savedDealIds, dealId];
    setSavedDealIds(next);
    window.localStorage.setItem(SAVED_DEALS_KEY, JSON.stringify(next));
  }

  function clearFilters() {
    setSearch("");
    setSelectedCategory("all");
    setView("all");
  }

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 mb-5 border-y border-zinc-800/90 bg-zinc-950/95 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search deals or brands" className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-4 text-base text-white outline-none placeholder:text-zinc-500 focus:border-amber-400" />
          </div>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button onClick={() => setView("all")} className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ${view === "all" ? "bg-amber-400 text-zinc-950" : "bg-zinc-900 text-zinc-300"}`}>All deals</button>
            <button onClick={() => setView("saved")} className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ${view === "saved" ? "bg-amber-400 text-zinc-950" : "bg-zinc-900 text-zinc-300"}`}>Saved {savedDealIds.length > 0 && `(${savedDealIds.length})`}</button>
            <span className="h-6 w-px shrink-0 bg-zinc-800" />
            {categories.map(([id, name]) => <button key={id} onClick={() => setSelectedCategory(selectedCategory === id ? "all" : id)} className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ${selectedCategory === id ? "bg-white text-zinc-950" : "bg-zinc-900 text-zinc-300"}`}>{name}</button>)}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{visibleDeals.length} deal{visibleDeals.length === 1 ? "" : "s"}</p>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm font-semibold normal-case tracking-normal text-zinc-200 outline-none focus:border-amber-400">
            <option value="newest">Newest</option><option value="score">Deal score</option><option value="discount">Discount</option>
          </select>
        </label>
      </div>

      {visibleDeals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-12 text-center">
          <p className="text-lg font-bold text-white">{view === "saved" && savedDealIds.length === 0 ? "No saved deals yet" : "No deals match"}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">{view === "saved" && savedDealIds.length === 0 ? "Tap Save on anything worth coming back to." : "Try another category or clear your search."}</p>
          {(search || selectedCategory !== "all" || view !== "all") && <button onClick={clearFilters} className="mt-5 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950">Show all deals</button>}
          {hiddenDealIds.length > 0 && <button onClick={() => { setHiddenDealIds([]); window.localStorage.removeItem(HIDDEN_DEALS_KEY); }} className="mt-3 block w-full text-sm font-semibold text-zinc-400">Restore {hiddenDealIds.length} hidden</button>}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleDeals.map((deal) => {
            const saved = savedDealIds.includes(deal.id);
            const timing = getTiming(deal.expires_at);
            return (
              <article key={deal.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-lg shadow-black/20">
                <div className="relative">
                  {deal.image_url && <a href={deal.amazon_url || "#"} target="_blank" rel="sponsored nofollow noreferrer" aria-label={`View ${deal.title} on Amazon`} className="block aspect-square w-full bg-white p-5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400 sm:aspect-[4/3]"><img src={deal.image_url} alt={deal.title} className="h-full w-full object-contain" /></a>}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    {deal.scoring_components?.editorial?.featured && <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-amber-300 shadow">Featured</span>}
                    {isRecent(deal.created_at) && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-zinc-950 shadow">Recently added</span>}
                  </div>
                  <button onClick={() => toggleSaved(deal.id)} aria-label={saved ? `Remove ${deal.title} from saved deals` : `Save ${deal.title}`} aria-pressed={saved} className={`absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border shadow-lg backdrop-blur ${saved ? "border-amber-300 bg-amber-400 text-zinc-950" : "border-zinc-300 bg-zinc-950/80 text-white"}`}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z"/></svg>
                  </button>
                </div>

                <div className="p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {deal.badges?.filter((badge) => publicBadges.includes(badge)).slice(0, 2).map((badge) => <span key={badge} className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">{badge}</span>)}
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{deal.categories?.name || deal.category_id}</span>
                  </div>
                  <h2 className="text-lg font-bold leading-snug text-white">{deal.title}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{deal.brand || "Unknown brand"}</p>

                  <div className="mt-4 flex items-end justify-between gap-4 border-y border-zinc-800 py-4">
                    <div><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Amazon price</p><p className="mt-1 text-3xl font-black tracking-tight text-white">{formatPrice(deal.current_price)}</p></div>
                    <div className="text-right"><p className={`text-sm font-bold ${timing.urgent ? "text-amber-300" : "text-zinc-300"}`}>{timing.text}</p><p className="mt-1 text-xs text-zinc-500">Published {formatPublished(deal.created_at)}</p></div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
                    <span>{getAmazonFreshnessText(deal.scoring_components?.lifecycle?.checkedAt)}</span>
                    <span className="shrink-0 rounded-md bg-zinc-800 px-2 py-1 font-bold text-zinc-300">Score {deal.deal_score}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-600">Price and availability may change. Final price is shown on Amazon.</p>

                  <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
                    <a href={deal.amazon_url || "#"} target="_blank" rel="sponsored nofollow noreferrer" className="rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-black text-zinc-950">View on Amazon</a>
                    <button onClick={() => toggleSaved(deal.id)} className={`min-w-16 rounded-xl px-3 py-3 text-sm font-bold ${saved ? "bg-amber-400/15 text-amber-300" : "bg-zinc-800 text-zinc-300"}`}>{saved ? "Saved" : "Save"}</button>
                    <button onClick={() => hideDeal(deal.id)} className="rounded-xl bg-zinc-800 px-3 py-3 text-sm font-bold text-zinc-400">Hide</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {visibleDeals.length > 0 && hiddenDealIds.length > 0 && <button onClick={() => { setHiddenDealIds([]); window.localStorage.removeItem(HIDDEN_DEALS_KEY); }} className="mt-6 w-full rounded-xl border border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-400">Restore hidden deals ({hiddenDealIds.length})</button>}
    </>
  );
}
