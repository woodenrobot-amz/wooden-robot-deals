"use client";

import { useEffect, useMemo, useState } from "react";
import { dateInEasternTime, type PostingGroup } from "@/lib/deal-schedule";

type PostEvent = {
  id: string;
  posting_group_id: string | null;
  schedule_date: string;
  schedule_hour: number | null;
  source: "queue" | "unplanned";
  asin: string | null;
  product_title: string | null;
  affiliate_url: string | null;
  post_body: string;
  posted_at: string;
  platform: string | null;
  destination: string | null;
  category: string | null;
  notes: string | null;
};

type Draft = {
  productTitle: string;
  destination: string;
  postedAt: string;
  platform: string;
  postingGroupId: string;
  asin: string;
  url: string;
  postBody: string;
  category: string;
  notes: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateTimeForDate(date: string) {
  const now = new Date();
  return `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function emptyDraft(date: string): Draft {
  return {
    productTitle: "",
    destination: "",
    postedAt: dateTimeForDate(date),
    platform: "",
    postingGroupId: "",
    asin: "",
    url: "",
    postBody: "",
    category: "",
    notes: "",
  };
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatPostTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function groupName(groups: PostingGroup[], id: string | null) {
  return groups.find((group) => group.id === id)?.name || null;
}

export function UnplannedPostTracker({
  initialDate,
  groups,
}: {
  initialDate: string;
  groups: PostingGroup[];
}) {
  const [date, setDate] = useState(initialDate);
  const [events, setEvents] = useState<PostEvent[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialDate));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const queueCount = useMemo(() => events.filter((event) => event.source === "queue").length, [events]);
  const unplannedCount = events.length - queueCount;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/post-events?date=${date}`, { cache: "no-store" });
        const data = (await response.json()) as { events?: PostEvent[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load post history.");
        if (!cancelled) setEvents(data.events || []);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load post history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [date]);

  async function reloadEvents(nextDate: string) {
    const response = await fetch(`/api/admin/post-events?date=${nextDate}`, { cache: "no-store" });
    const data = (await response.json()) as { events?: PostEvent[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load post history.");
    setEvents(data.events || []);
  }

  function changeDate(nextDate: string) {
    setDate(nextDate);
    if (!open) setDraft(emptyDraft(nextDate));
  }

  function startEntry() {
    setDraft(emptyDraft(date));
    setNotice("");
    setOpen(true);
  }

  function updateDraft(change: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  async function saveUnplannedPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const localDate = draft.postedAt.slice(0, 10);
      const response = await fetch("/api/admin/post-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          scheduleDate: localDate,
          postedAt: new Date(draft.postedAt).toISOString(),
          postingGroupId: draft.postingGroupId || null,
          asin: draft.asin || null,
          url: draft.url || null,
          category: draft.category || null,
          notes: draft.notes || null,
        }),
      });
      const data = (await response.json()) as { event?: PostEvent; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the post.");
      setNotice("Unplanned post recorded.");
      setOpen(false);
      setDate(localDate);
      setDraft(emptyDraft(localDate));
      await reloadEvents(localDate);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-2 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl shadow-black/10 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Post tracker</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-black text-white">{events.length} posts</h2>
            <p className="text-sm text-zinc-400"><span className="font-bold text-white">{queueCount}</span> Queue · <span className="font-bold text-sky-300">{unplannedCount}</span> Unplanned</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => changeDate(shiftDate(date, -1))} className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-zinc-800 px-3 font-bold text-zinc-200">‹</button>
          <button type="button" onClick={() => changeDate(dateInEasternTime())} className="min-h-11 rounded-xl bg-zinc-800 px-3 text-sm font-bold text-zinc-200">Today</button>
          <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-white" />
          <button type="button" onClick={() => changeDate(shiftDate(date, 1))} className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-zinc-800 px-3 font-bold text-zinc-200">›</button>
          <button type="button" onClick={open ? () => setOpen(false) : startEntry} className="min-h-11 rounded-xl bg-sky-300 px-4 text-sm font-extrabold text-zinc-950">{open ? "Cancel" : "+ Unplanned Post"}</button>
        </div>
      </div>

      {notice && <p aria-live="polite" className="mt-3 text-sm font-semibold text-amber-300">{notice}</p>}

      {open && (
        <form onSubmit={saveUnplannedPost} className="mt-4 rounded-2xl border border-sky-300/25 bg-zinc-950/70 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="md:col-span-2"><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Product / short title *</span><input required maxLength={300} value={draft.productTitle} onChange={(event) => updateDraft({ productTitle: event.target.value })} placeholder="DeWalt planer" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-sky-300" /></label>
            <label><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Destination *</span><input required maxLength={160} value={draft.destination} onChange={(event) => updateDraft({ destination: event.target.value })} placeholder="Woodworking Deals" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-sky-300" /></label>
            <label><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Posted at *</span><input required type="datetime-local" value={draft.postedAt} onChange={(event) => updateDraft({ postedAt: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-sky-300" /></label>
            <label><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Platform</span><input maxLength={80} list="post-platforms" value={draft.platform} onChange={(event) => updateDraft({ platform: event.target.value })} placeholder="Facebook" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-sky-300" /><datalist id="post-platforms"><option value="Facebook" /><option value="Amazon" /><option value="YouTube" /><option value="Instagram" /></datalist></label>
            <label><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Posting group</span><select value={draft.postingGroupId} onChange={(event) => updateDraft({ postingGroupId: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-sky-300"><option value="">Not linked</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">ASIN</span><input maxLength={10} value={draft.asin} onChange={(event) => updateDraft({ asin: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} placeholder="Optional" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 font-mono uppercase text-white outline-none focus:border-sky-300" /></label>
            <label><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Category</span><input maxLength={120} value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })} placeholder="Router, EDC, Tech…" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-sky-300" /></label>
            <label className="md:col-span-2 xl:col-span-4"><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">URL</span><input type="url" value={draft.url} onChange={(event) => updateDraft({ url: event.target.value })} placeholder="https://…" className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-white outline-none focus:border-sky-300" /></label>
            <label className="md:col-span-2"><span className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"><span>Post text</span><span className="normal-case tracking-normal"><span className={draft.postBody.length > 130 ? "text-red-400" : "text-zinc-400"}>{draft.postBody.length}</span>/130</span></span><textarea rows={4} value={draft.postBody} onChange={(event) => updateDraft({ postBody: event.target.value })} placeholder="Optional — paste the post if you have it." className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-sky-300" /></label>
            <label className="md:col-span-2"><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Notes</span><textarea rows={4} maxLength={2000} value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Optional context for later." className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-sky-300" /></label>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800 pt-4"><p className="text-xs text-zinc-500">Only title, destination, and date/time are required.</p><button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-emerald-300 px-5 text-sm font-extrabold text-zinc-950 disabled:opacity-50">{saving ? "Saving…" : "Record post"}</button></div>
        </form>
      )}

      <div className="mt-4 border-t border-zinc-800 pt-4">
        <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Post history</p>{loading && <span className="text-xs font-semibold text-zinc-600">Loading…</span>}</div>
        {!loading && events.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-600">No posts recorded for this date yet.</p> : (
          <div className="space-y-2">{events.map((event) => {
            const linkedGroup = groupName(groups, event.posting_group_id);
            const title = event.product_title || event.asin || "Scheduled post";
            const destination = event.destination || linkedGroup;
            return <article key={event.id} className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${event.source === "unplanned" ? "bg-sky-300/15 text-sky-300" : "bg-amber-300/15 text-amber-300"}`}>{event.source === "unplanned" ? "Unplanned" : "Queue"}</span><span className="text-xs font-bold tabular-nums text-zinc-400">{formatPostTime(event.posted_at)}</span>{event.platform && <span className="text-xs text-zinc-500">{event.platform}</span>}</div><p className="mt-1 truncate text-sm font-bold text-white">{title}</p>{(destination || event.category) && <p className="mt-0.5 truncate text-xs text-zinc-500">{[destination, event.category].filter(Boolean).join(" · ")}</p>}</div><div className="flex shrink-0 items-center gap-2">{event.asin && <span className="font-mono text-[11px] text-zinc-600">{event.asin}</span>}{event.affiliate_url && <a href={event.affiliate_url} target="_blank" rel="noreferrer" className="min-h-9 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300">Open link</a>}</div></article>;
          })}</div>
        )}
      </div>
    </section>
  );
}
