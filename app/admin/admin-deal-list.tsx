"use client";

import { useState } from "react";

type CandidateHistory = { asin: string; stream_id: string; status: string; raw_data: unknown };
type AdminDeal = {
  id: string; asin: string; title: string; brand: string | null; category_id: string | null;
  deal_score: number; current_price: number | null; avg_90_price: number | null;
  image_url: string | null; status: string; source: string | null; created_at: string;
  expires_at: string; candidate_history: CandidateHistory[];
  scoring_components: {
    discountPercent?: number;
    lifecycle?: { checkedAt?: string; outcome?: string; reason?: string | null };
    editorial?: { featured?: boolean; updatedAt?: string; updatedBy?: string };
    [key: string]: unknown;
  } | null;
};
type Category = { id: string; name: string };

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function AdminDealList({ initialDeals, categories }: { initialDeals: AdminDeal[]; categories: Category[] }) {
  const [deals, setDeals] = useState(initialDeals);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", categoryId: "", expiresAt: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function action(dealId: string, payload: Record<string, unknown>) {
    setBusyId(dealId); setMessage("");
    const response = await fetch("/api/admin/manage-deal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: dealId, ...payload }) });
    const data = await response.json();
    setBusyId(null);
    if (!response.ok) { setMessage(data.error || "Editorial update failed."); return null; }
    return data.deal as Partial<AdminDeal>;
  }

  function startEdit(deal: AdminDeal) {
    setEditingId(deal.id);
    setDraft({ title: deal.title, categoryId: deal.category_id || "", expiresAt: toLocalInput(deal.expires_at) });
  }

  async function save(deal: AdminDeal) {
    const updated = await action(deal.id, { action: "save", title: draft.title, categoryId: draft.categoryId || null, expiresAt: new Date(draft.expiresAt).toISOString() });
    if (!updated) return;
    setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, ...updated } : item));
    setEditingId(null); setMessage("Editorial changes saved.");
  }

  async function quickExtend(deal: AdminDeal, hours: number) {
    const base = Math.max(Date.now(), new Date(deal.expires_at).getTime());
    const expiresAt = new Date(base + hours * 3_600_000).toISOString();
    const updated = await action(deal.id, { action: "save", title: deal.title, categoryId: deal.category_id, expiresAt });
    if (!updated) return;
    setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, ...updated } : item));
    setMessage(`Expiration extended ${hours} hours.`);
  }

  async function toggleFeatured(deal: AdminDeal) {
    const featured = !deal.scoring_components?.editorial?.featured;
    const updated = await action(deal.id, { action: "feature", featured });
    if (!updated) return;
    setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, ...updated } : item));
    setMessage(featured ? "Deal featured." : "Feature removed.");
  }

  async function unpublish(deal: AdminDeal) {
    if (!window.confirm(`Remove ${deal.title} from the live feed? The ASIN will remain eligible for future discovery.`)) return;
    const updated = await action(deal.id, { action: "unpublish" });
    if (!updated) return;
    setDeals((current) => current.filter((item) => item.id !== deal.id));
    setMessage("Deal unpublished. ASIN was not ignored.");
  }

  async function refreshDeals() {
    setRefreshing(true); setMessage("");
    const response = await fetch("/api/admin/refresh-deals", { method: "POST" });
    const data = await response.json(); setRefreshing(false);
    if (!response.ok) { setMessage(data.error || "Failed to refresh deals."); return; }
    setDeals((current) => current.map((deal) => {
      const refreshed = data.deals.find((item: { id: string }) => item.id === deal.id);
      return refreshed ? { ...deal, ...refreshed } : deal;
    }));
    setMessage(`Refreshed ${data.refreshed} deal(s). Skipped ${data.skipped}.`);
  }

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Active Deals <span className="text-zinc-500">({deals.length})</span></h2>
        <button onClick={refreshDeals} disabled={refreshing} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh Prices"}</button>
      </div>
      {message && <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">{message}</p>}

      <div className="mt-4 space-y-4">
        {deals.map((deal) => {
          const featured = deal.scoring_components?.editorial?.featured === true;
          const editing = editingId === deal.id;
          return <article key={deal.id} className={`rounded-2xl border bg-zinc-900 p-4 ${featured ? "border-amber-400/70" : "border-zinc-800"}`}>
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 rounded-xl bg-white p-2">{deal.image_url && <img src={deal.image_url} alt={deal.title} className="h-full w-full object-contain" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><span>{deal.asin}</span>{featured && <span className="rounded-full bg-amber-400 px-2 py-1 font-bold text-zinc-950">Featured</span>}<span>Score {deal.deal_score}</span></div>
                <h3 className="mt-1 font-bold leading-snug">{deal.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{deal.brand || "Unknown brand"} · ${deal.current_price ?? "—"}</p>
                <p className="mt-2 text-xs text-zinc-500">Published {new Date(deal.created_at).toLocaleString()} · Expires {new Date(deal.expires_at).toLocaleString()}</p>
              </div>
            </div>

            {editing && <div className="mt-4 grid gap-3 rounded-xl bg-zinc-950 p-4 sm:grid-cols-2">
              <label className="sm:col-span-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Public title<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm normal-case tracking-normal text-white" /></label>
              <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Category<select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm normal-case tracking-normal text-white"><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Expiration<input type="datetime-local" value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm normal-case tracking-normal text-white" /></label>
              <div className="sm:col-span-2 flex gap-2"><button onClick={() => save(deal)} disabled={busyId === deal.id} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950">Save</button><button onClick={() => setEditingId(null)} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300">Cancel</button></div>
            </div>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => editing ? setEditingId(null) : startEdit(deal)} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold text-zinc-200">Edit</button>
              <button onClick={() => quickExtend(deal, 24)} disabled={busyId === deal.id} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold text-zinc-200">+24h</button>
              <button onClick={() => quickExtend(deal, 48)} disabled={busyId === deal.id} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold text-zinc-200">+48h</button>
              <button onClick={() => toggleFeatured(deal)} disabled={busyId === deal.id} className={`rounded-lg px-3 py-2 text-sm font-bold ${featured ? "bg-amber-400 text-zinc-950" : "bg-amber-400/10 text-amber-300"}`}>{featured ? "Unfeature" : "Feature"}</button>
              <button onClick={() => unpublish(deal)} disabled={busyId === deal.id} className="ml-auto rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">Unpublish</button>
            </div>

            <details className="mt-4 border-t border-zinc-800 pt-3 text-sm"><summary className="cursor-pointer font-semibold text-zinc-400">History & source</summary><div className="mt-3 space-y-2 text-xs text-zinc-500"><p>Source: {deal.source || "Manual"}</p><p>Last Amazon check: {deal.scoring_components?.lifecycle?.checkedAt ? new Date(deal.scoring_components.lifecycle.checkedAt).toLocaleString() : "Pending"} · {deal.scoring_components?.lifecycle?.outcome || "No outcome"}</p>{deal.candidate_history.map((item, index) => <p key={`${item.stream_id}-${index}`}>Candidate: {item.stream_id} · {item.status}</p>)}{deal.scoring_components?.editorial?.updatedAt && <p>Last editorial change: {new Date(deal.scoring_components.editorial.updatedAt).toLocaleString()} by {deal.scoring_components.editorial.updatedBy}</p>}</div></details>
          </article>;
        })}
        {deals.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">No active deals.</p>}
      </div>
    </section>
  );
}
