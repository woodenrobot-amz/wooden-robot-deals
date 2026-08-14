"use client";

import { useMemo, useState } from "react";

type ScoreComponents = {
  discountPercent?: number;
  discountScore?: number;
  brandScore?: number;
  demandScore?: number;
  confidenceScore?: number;
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
};

type Candidate = {
  asin: string;
  stream_id: string;
  category_id: string | null;
  raw_data: { enrichment?: Enrichment } | null;
};

type ReviewAction = "publish" | "reject" | "ignore";

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
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

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
            deal.deal_score >= minScore
          );
        })
        .sort(
          (left, right) =>
            (right.raw_data?.enrichment?.deal_score || 0) -
            (left.raw_data?.enrichment?.deal_score || 0),
        ),
    [candidates, category, minScore, search],
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
      current.filter(
        (item) =>
          item.asin !== candidate.asin || item.stream_id !== candidate.stream_id,
      ),
    );
    setMessage(
      action === "publish"
        ? `${candidate.asin} is now live.`
        : action === "ignore"
          ? `${candidate.asin} ignored permanently.`
          : `${candidate.asin} rejected.`,
    );
    setBusyKey("");
  }

  return (
    <section className="mt-6">
      <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, brand, ASIN"
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none md:col-span-2"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value={0}>All scores</option>
          <option value={40}>Score 40+</option>
          <option value={55}>Score 55+</option>
          <option value={75}>Score 75+</option>
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-zinc-400">
        <span>Showing {visible.length} of {candidates.length} enriched candidates</span>
        {message && <span className="text-amber-300">{message}</span>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {visible.map((candidate) => {
          const deal = candidate.raw_data?.enrichment;
          if (!deal) return null;
          const key = `${candidate.stream_id}:${candidate.asin}`;
          const components = deal.scoring_components || {};

          return (
            <article key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
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

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  onClick={() => review(candidate, "publish")}
                  disabled={Boolean(busyKey)}
                  className="rounded-xl bg-green-400 px-3 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
                >
                  {busyKey === key ? "Working..." : "Publish"}
                </button>
                <button
                  onClick={() => review(candidate, "reject")}
                  disabled={Boolean(busyKey)}
                  className="rounded-xl bg-zinc-700 px-3 py-2 text-sm font-bold disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => review(candidate, "ignore")}
                  disabled={Boolean(busyKey)}
                  className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300 disabled:opacity-50"
                >
                  Ignore
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-500">
          No enriched candidates match these filters.
        </p>
      )}
    </section>
  );
}
