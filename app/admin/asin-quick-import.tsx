"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type EnrichedDeal = {
  asin: string;
  title: string;
  brand: string;
  category_id: string;
  image_url: string;
  amazon_url: string;
  current_price: number;
  avg_90_price: number;
  deal_score: number;
  badges: string[];
};

export function AsinQuickImport() {
  const supabase = createClient();

  const [asin, setAsin] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<EnrichedDeal | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFetch() {
    if (!asin.trim()) {
      setMessage("Enter an ASIN first.");
      return;
    }

    setLoading(true);
    setMessage("");
    setResult(null);

    const response = await fetch("/api/enrich-asin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ asin }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Failed to fetch ASIN data.");
      setLoading(false);
      return;
    }

    setResult(data);
    setMessage("Fetched deal preview.");
    setLoading(false);
  }

  async function handleSaveDeal() {
    if (!result) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("deals").insert({
      asin: result.asin,
      title: result.title,
      brand: result.brand,
      category_id: result.category_id,
      image_url: result.image_url,
      amazon_url: result.amazon_url,
      current_price: result.current_price,
      avg_90_price: result.avg_90_price,
      deal_score: result.deal_score,
      badges: result.badges,
      status: "active",
      source: "quick_import",
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

   if (error) {
  if (error.code === "23505") {
    setMessage("Deal already exists in the active feed.");
  } else {
    setMessage(error.message);
  }

  setSaving(false);
  return;
}

    setMessage("Deal saved.");
    setResult(null);
    setAsin("");
    setSaving(false);
  }

  return (
    <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">ASIN Quick Import</h2>

      <p className="mt-2 text-sm text-zinc-400">
        Fetch an ASIN, preview the enriched data, then save it as an active deal.
      </p>

      <div className="mt-4 flex gap-3">
        <input
          value={asin}
          onChange={(event) => setAsin(event.target.value)}
          placeholder="Enter ASIN"
          className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none"
        />

        <button
          onClick={handleFetch}
          disabled={loading}
          className="rounded-xl bg-amber-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-50"
        >
          {loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      {message && (
        <p className="mt-4 text-sm text-zinc-300">
          {message}
        </p>
      )}

      {result && (
        <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          {result.image_url && (
            <div className="mb-4 rounded-xl bg-white p-3">
              <img
                src={result.image_url}
                alt={result.title}
                className="mx-auto h-40 w-full object-contain"
              />
            </div>
          )}

          <div className="mb-2 flex flex-wrap gap-2">
            {result.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300"
              >
                {badge}
              </span>
            ))}
          </div>

          <h3 className="text-lg font-bold">
            {result.title}
          </h3>

          <p className="mt-1 text-sm text-zinc-400">
            {result.brand} · {result.asin}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-zinc-900 p-3">
              <div className="text-zinc-500">Current</div>
              <div className="font-bold">${result.current_price}</div>
            </div>

            <div className="rounded-xl bg-zinc-900 p-3">
              <div className="text-zinc-500">90d Avg</div>
              <div className="font-bold">${result.avg_90_price}</div>
            </div>

            <div className="rounded-xl bg-zinc-900 p-3">
              <div className="text-zinc-500">Score</div>
              <div className="font-bold">{result.deal_score}</div>
            </div>
          </div>

          <button
            onClick={handleSaveDeal}
            disabled={saving}
            className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Deal"}
          </button>
        </div>
      )}
    </div>
  );
}