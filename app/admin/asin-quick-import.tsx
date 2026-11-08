"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FEED_DEAL_LIFETIME_MS, FEED_HUB_SOURCE, publicDealCategories } from "@/lib/public-feed";

type DealPreview = {
  asin: string;
  title: string;
  brand: string;
  image_url: string | null;
  amazon_url: string;
  current_price: number;
  live_price_verified: boolean;
  avg_90_price: number | null;
  deal_score: number;
  badges: string[];
  scoring_components: Record<string, unknown>;
};

type PreviewCard = {
  asin: string;
  deal?: DealPreview;
  checkedAt?: string;
  selected: boolean;
  message?: string;
  published?: boolean;
};

const MAX_BATCH_SIZE = 10;

export function AsinQuickImport() {
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("top_deals");
  const [cards, setCards] = useState<PreviewCard[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"preview" | "publish" | null>(null);
  const selected = cards.filter((card) => card.selected);

  async function previewDeals() {
    const asins = [...new Set(input.trim().toUpperCase().split(/[\s,;]+/))];
    const invalid = asins.find((asin) => !/^[A-Z0-9]{10}$/.test(asin));
    if (invalid !== undefined || asins.length > MAX_BATCH_SIZE) {
      setMessage("Paste up to 10 valid ASINs, separated by spaces, commas, or newlines.");
      return;
    }

    setBusy("preview");
    setMessage("");
    setCards([]);
    for (const [index, asin] of asins.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      let card: PreviewCard;
      try {
        const response = await fetch("/api/enrich-asin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asin }),
        });
        const data = await response.json();
        if (!response.ok) {
          card = { asin, selected: false, message: data.error || "Could not preview this ASIN." };
        } else {
          const deal = data as DealPreview;
          card = {
            asin, deal, selected: deal.live_price_verified,
            checkedAt: new Date().toISOString(),
            message: deal.live_price_verified ? undefined : "Amazon did not confirm a live price. Preview again before publishing.",
          };
        }
      } catch {
        card = { asin, selected: false, message: "Could not preview this ASIN. Try again." };
      }
      setCards((current) => [...current, card]);
    }
    setBusy(null);
  }

  async function publishDeals() {
    setBusy("publish");
    setMessage("");
    const supabase = createClient();
    let published = 0;

    for (const card of selected) {
      const deal = card.deal!;
      let message: string;
      let success = false;
      try {
        const checkedAt = card.checkedAt!;
        if (Date.now() - Date.parse(checkedAt) >= 60 * 60 * 1000) {
          throw new Error("This preview is more than an hour old. Preview it again.");
        }
        const { error } = await supabase.from("deals").insert({
          asin: deal.asin,
          title: deal.title,
          brand: deal.brand,
          category_id: category,
          image_url: deal.image_url,
          amazon_url: deal.amazon_url,
          current_price: deal.current_price,
          avg_90_price: deal.avg_90_price,
          deal_score: deal.deal_score,
          badges: deal.badges,
          scoring_components: {
            ...deal.scoring_components,
            lifecycle: { checkedAt, outcome: "published", referencePrice: deal.current_price },
          },
          status: "active",
          source: FEED_HUB_SOURCE,
          expires_at: new Date(Date.now() + FEED_DEAL_LIFETIME_MS).toISOString(),
        });
        if (error && error.code !== "23505") throw new Error(error.message);
        success = !error;
        message = success ? "Published" : "Already in the live catalog.";
      } catch (error) {
        message = error instanceof Error ? error.message : "Publishing failed. Try again.";
      }
      if (success) published += 1;
      setCards((current) => current.map((entry) =>
        entry.asin === card.asin ? { ...entry, selected: false, published: success, message } : entry,
      ));
    }

    setMessage(`Published ${published} of ${selected.length} selected deals.`);
    setBusy(null);
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">Import deals by ASIN</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Paste up to 10 ASINs from Amazon New Arrivals or your own picks, then review the cards before publishing.
      </p>
      <label className="mt-4 block text-sm font-semibold" htmlFor="feed-asins">ASINs</label>
      <textarea
        id="feed-asins"
        rows={4}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        disabled={busy !== null}
        className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3"
      />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-2 text-sm font-semibold">
          Public category
          <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={busy !== null}
            className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            {publicDealCategories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <button onClick={previewDeals} disabled={busy !== null || !input.trim()}
          className="rounded-xl border border-zinc-600 px-4 py-3 font-semibold disabled:opacity-50">
          {busy === "preview" ? "Loading previews…" : "Preview deals"}
        </button>
        <button onClick={publishDeals} disabled={busy !== null || !selected.length}
          className="rounded-xl bg-amber-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-50">
          {busy === "publish" ? "Publishing…" : `Publish selected (${selected.length})`}
        </button>
      </div>
      <p className="mt-3 text-sm text-zinc-300" role="status">{message}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <article key={card.asin} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            {card.deal?.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element -- Amazon supplies remote product images. */
              <img src={card.deal.image_url} alt="" loading="lazy"
                className="mb-3 h-36 w-full rounded-xl bg-white object-contain p-2" />
            )}
            <h3 className="font-bold">{card.deal?.title || card.asin}</h3>
            {card.deal && (
              <>
                <p className="mt-1 text-sm text-zinc-400">{card.deal.brand} · {card.asin}</p>
                <p className="mt-2 text-sm">
                  {card.deal.live_price_verified ? `$${card.deal.current_price.toFixed(2)} · ` : ""}
                  Score {card.deal.deal_score}
                </p>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={card.selected}
                    disabled={busy !== null || card.published || !card.deal.live_price_verified}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setCards((current) => current.map((entry) =>
                        entry.asin === card.asin ? { ...entry, selected: checked } : entry,
                      ));
                    }} />
                  Include in publish
                </label>
              </>
            )}
            {card.message && <p className="mt-2 text-sm text-zinc-300">{card.message}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
