"use client";

import { useMemo, useState } from "react";

type ScoreComponents = {
  discountPercent?: number;
  discountScore?: number;
  brandScore?: number;
  demandScore?: number;
  confidenceScore?: number;
  shippingCheck?: {
    amazonPrice?: number | null;
    keepaLandedPrice?: number | null;
    estimatedShipping?: number | null;
    effectiveDiscountPercent?: number | null;
  };
};

type Enrichment = {
  asin: string;
  title: string;
  brand: string;
  category_id: string | null;
  image_url: string | null;
  amazon_url: string;
  keepa_url: string;
  current_price: number | null;
  avg_90_price: number | null;
  deal_score: number;
  badges?: string[];
  scoring_components?: ScoreComponents;
  brand_tier?: string;
  rating?: number | null;
  review_count?: number | null;
  sales_rank?: number | null;
  amazon_price?: number | null;
  keepa_landed_price?: number | null;
  estimated_shipping?: number | null;
  effective_discount_percent?: number | null;
};

export type Candidate = {
  asin: string;
  stream_id: string;
  category_id: string | null;
  status: "enriched" | "published";
  is_live: boolean;
  raw_data: { enrichment?: Enrichment } | null;
};

type ReviewAction = "publish" | "defer" | "block";

const PAGE_SIZE = 50;

function money(value: number | null | undefined) {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

function scoreColor(score: number) {
  if (score >= 75) return "bg-green-400 text-zinc-950";
  if (score >= 55) return "bg-amber-400 text-zinc-950";
  return "bg-zinc-700 text-white";
}

export function CandidateReviewList({
  initialCandidates,
}: {
  initialCandidates: Candidate[];
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [decision, setDecision] = useState("pending");
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          candidates
            .map((candidate) => candidate.category_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [candidates],
  );

  const visible = useMemo(
    () =>
      candidates
        .filter((candidate) => {
          const deal = candidate.raw_data?.enrichment;
          if (!deal) return false;
          const haystack = `${deal.title} ${deal.brand} ${deal.asin}`.toLowerCase();
          return (
            haystack.includes(search.toLowerCase()) &&
            (category === "all" || candidate.category_id === category) &&
            (decision === "all" ||
              (decision === "pending" && candidate.status === "enriched") ||
              candidate.status === decision) &&
            deal.deal_score >= minScore
          );
        })
        .sort(
          (left, right) =>
            (right.raw_data?.enrichment?.deal_score || 0) -
            (left.raw_data?.enrichment?.deal_score || 0),
        ),
    [candidates, category, decision, minScore, search],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedCandidates = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  async function review(candidate: Candidate, action: ReviewAction) {
    const key = `${candidate.stream_id}:${candidate.asin}`;
    setBusyKey(key);
    setMessage("");

    const response = await fetch("/api/admin/review-candidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asin: candidate.asin,
        streamId: candidate.stream_id,
        action,
      }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(result.error || "Candidate review failed.");
      setBusyKey("");
      return;
    }

    setCandidates((current) =>
      action === "publish"
        ? current.map((item) =>
            item.asin === candidate.asin &&
            item.stream_id === candidate.stream_id
              ? { ...item, status: "published", is_live: true }
              : item,
          )
        : current.filter(
            (item) =>
              item.asin !== candidate.asin ||
              item.stream_id !== candidate.stream_id,
          ),
    );
    setMessage(
      action === "publish"
        ? `${candidate.asin} is now live.`
        : action === "block"
          ? `${candidate.asin} will never be published.`
          : `${candidate.asin} deferred for seven days.`,
    );
    setBusyKey("");
  }

  return (
    <section className="mt-6">
      <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:grid-cols-5">
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search title, brand, ASIN"
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none lg:col-span-2"
        />
        <select
          value={category}
          onChange={(event) => { setCategory(event.target.value); setPage(1); }}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select
          value={minScore}
          onChange={(event) => { setMinScore(Number(event.target.value)); setPage(1); }}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value={0}>All scores</option>
          <option value={40}>Score 40+</option>
          <option value={55}>Score 55+</option>
          <option value={75}>Score 75+</option>
        </select>
        <select
          value={decision}
          onChange={(event) => { setDecision(event.target.value); setPage(1); }}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="pending">Pending review</option>
          <option value="published">Published</option>
          <option value="all">All decisions</option>
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-zinc-400">
        <span>
          Showing {visible.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
          {Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length} matches
          ({candidates.length} total)
        </span>
        {message && <span className="text-amber-300">{message}</span>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {pagedCandidates.map((candidate) => {
          const deal = candidate.raw_data?.enrichment;
          if (!deal) return null;
          const key = `${candidate.stream_id}:${candidate.asin}`;
          const components = deal.scoring_components || {};

          return (
            <article
              key={key}
              className={`rounded-2xl border p-4 ${
                candidate.status === "published" && candidate.is_live
                  ? "border-green-400/50 bg-green-950/20"
                  : candidate.status === "published"
                    ? "border-amber-400/50 bg-amber-950/20"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              {candidate.status === "published" && candidate.is_live && (
                <div className="mb-3 flex items-center justify-between rounded-xl bg-green-400/10 px-3 py-2 text-sm font-bold text-green-300">
                  <span>✓ Published · Live</span>
                  <a href="/admin/manage-deals" className="font-medium underline">
                    Manage live deal
                  </a>
                </div>
              )}
              {candidate.status === "published" && !candidate.is_live && (
                <div className="mb-3 rounded-xl bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-300">
                  ⚠ Published decision recorded, but no active live deal was found
                </div>
              )}
              <div className="flex gap-4">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-xl bg-white p-2">
                  {deal.image_url ? (
                    <img src={deal.image_url} alt={deal.title} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-zinc-500">No image</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-zinc-500">{deal.asin}</span>
                    <div className={`rounded-xl px-3 py-2 text-center ${scoreColor(deal.deal_score)}`}>
                      <div className="text-[9px] font-bold uppercase">Score</div>
                      <div className="text-2xl font-black leading-none">{deal.deal_score}</div>
                    </div>
                  </div>
                  <h2 className="mt-1 line-clamp-3 font-bold">{deal.title}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {deal.brand} · {deal.brand_tier || "unrated"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {candidate.category_id} · {candidate.stream_id}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                <div className="rounded-xl bg-zinc-950 p-2">
                  <div className="text-xs text-zinc-500">Now</div>
                  <div className="font-bold">{money(deal.current_price)}</div>
                </div>
                <div className="rounded-xl bg-zinc-950 p-2">
                  <div className="text-xs text-zinc-500">90d avg</div>
                  <div className="font-bold">{money(deal.avg_90_price)}</div>
                </div>
                <div className="rounded-xl bg-zinc-950 p-2">
                  <div className="text-xs text-zinc-500">Discount</div>
                  <div className="font-bold">{components.discountPercent ?? 0}%</div>
                </div>
                <div className="rounded-xl bg-zinc-950 p-2">
                  <div className="text-xs text-zinc-500">Rating</div>
                  <div className="font-bold">{deal.rating ?? "—"}</div>
                </div>
              </div>

              {deal.keepa_landed_price != null && (
                <div className={`mt-3 rounded-xl border p-3 ${
                  (deal.estimated_shipping || 0) > 0.01
                    ? "border-amber-400/50 bg-amber-400/10"
                    : "border-zinc-800 bg-zinc-950"
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-sm font-bold ${(deal.estimated_shipping || 0) > 0.01 ? "text-amber-300" : "text-zinc-200"}`}>
                        {(deal.estimated_shipping || 0) > 0.01
                          ? `Possible shipping charge: ${money(deal.estimated_shipping)}`
                          : "No shipping surcharge detected"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Keepa estimated delivered price: {money(deal.keepa_landed_price)}
                        {deal.effective_discount_percent != null &&
                          ` · Effective discount ${deal.effective_discount_percent}%`}
                      </p>
                    </div>
                    {(deal.estimated_shipping || 0) > 0.01 && (
                      <span className="shrink-0 rounded-full bg-amber-400 px-2 py-1 text-[10px] font-black uppercase text-zinc-950">
                        Check shipping
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-600">
                    Estimate only. Final shipping depends on the Amazon offer,
                    address, and customer eligibility.
                  </p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
                <span>Reviews: {deal.review_count?.toLocaleString() ?? "—"}</span>
                <span>Rank: {deal.sales_rank?.toLocaleString() ?? "—"}</span>
                <span>Brand: +{components.brandScore ?? 0}</span>
                <span>Discount: +{components.discountScore ?? 0}</span>
                <span>Demand: +{components.demandScore ?? 0}</span>
                <span>Confidence: +{components.confidenceScore ?? 0}</span>
              </div>

              <div className="mt-3 flex gap-4 text-sm">
                <a href={deal.amazon_url} target="_blank" rel="noreferrer" className="text-amber-400">Amazon ↗</a>
                <a href={deal.keepa_url} target="_blank" rel="noreferrer" className="text-amber-400">Keepa ↗</a>
              </div>

              {candidate.status === "enriched" ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => review(candidate, "publish")}
                    disabled={Boolean(busyKey)}
                    className="rounded-xl bg-green-400 px-3 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
                  >
                    {busyKey === key ? "Working..." : "Publish"}
                  </button>
                  <button
                    onClick={() => review(candidate, "defer")}
                    disabled={Boolean(busyKey)}
                    className="rounded-xl bg-zinc-700 px-3 py-2 text-sm font-bold disabled:opacity-50"
                  >
                    Not Now · 7d
                  </button>
                  <button
                    onClick={() => review(candidate, "block")}
                    disabled={Boolean(busyKey)}
                    className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300 disabled:opacity-50"
                  >
                    Never Publish
                  </button>
                </div>
              ) : candidate.is_live ? (
                <div className="mt-4 rounded-xl bg-green-400 px-3 py-2 text-center text-sm font-bold text-zinc-950">
                  Published on the live website
                </div>
              ) : (
                <button
                  onClick={() => review(candidate, "publish")}
                  disabled={Boolean(busyKey)}
                  className="mt-4 w-full rounded-xl bg-amber-400 px-3 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
                >
                  {busyKey === key ? "Repairing..." : "Republish and repair"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={currentPage === totalPages}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {visible.length === 0 && (
        <p className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-500">
          No enriched candidates match these filters.
        </p>
      )}
    </section>
  );
}
