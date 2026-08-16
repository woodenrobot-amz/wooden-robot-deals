"use client";

import { useEffect, useMemo, useState } from "react";
import {
  dateInEasternTime,
  formatScheduleHour,
  SCHEDULE_HOURS,
  type PostingGroup,
  type ScheduleDay,
  type ScheduleItem,
  type ScheduleStatus,
} from "@/lib/deal-schedule";

type Draft = {
  postBody: string;
  commentText: string;
  asin: string;
  status: ScheduleStatus;
};

type ViewMode = "edit" | "copy";

const EMPTY_DRAFT: Draft = {
  postBody: "",
  commentText: "",
  asin: "",
  status: "planned",
};

const accentClasses: Record<PostingGroup["accent"], string> = {
  amber: "border-amber-300/70 bg-amber-300 text-zinc-950",
  blue: "border-sky-300/70 bg-sky-300 text-zinc-950",
  emerald: "border-emerald-300/70 bg-emerald-300 text-zinc-950",
  violet: "border-violet-300/70 bg-violet-300 text-zinc-950",
  rose: "border-rose-300/70 bg-rose-300 text-zinc-950",
};

function keyFor(groupId: string, hour: number) {
  return `${groupId}:${hour}`;
}

function draftFromItem(item?: ScheduleItem): Draft {
  if (!item) return { ...EMPTY_DRAFT };
  return {
    postBody: item.post_body,
    commentText: item.comment_text,
    asin: item.asin || "",
    status: item.status,
  };
}

function itemMatchesDraft(item: ScheduleItem | undefined, draft: Draft) {
  const saved = draftFromItem(item);
  return (
    saved.postBody === draft.postBody &&
    saved.commentText === draft.commentText &&
    saved.asin === draft.asin &&
    saved.status === draft.status
  );
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function draftsFor(items: ScheduleItem[], groups: PostingGroup[]) {
  const next: Record<string, Draft> = {};
  for (const group of groups) {
    for (const hour of SCHEDULE_HOURS) {
      next[keyFor(group.id, hour)] = draftFromItem(
        items.find(
          (item) => item.posting_group_id === group.id && item.schedule_hour === hour,
        ),
      );
    }
  }
  return next;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function DealScheduleBoard({
  initialDate,
  initialGroups,
  initialItems,
}: {
  initialDate: string;
  initialGroups: PostingGroup[];
  initialItems: ScheduleItem[];
}) {
  const [date, setDate] = useState(initialDate);
  const [groups, setGroups] = useState(initialGroups);
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState(() => draftsFor(initialItems, initialGroups));
  const [activeGroupId, setActiveGroupId] = useState(initialGroups[0]?.id || "");
  const [mode, setMode] = useState<ViewMode>("edit");
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const savedMode = window.localStorage.getItem("dealSchedule.viewMode") as ViewMode | null;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const compactScreen = window.matchMedia("(max-width: 767px)").matches;
    queueMicrotask(() => {
      setMode(savedMode || (standalone || compactScreen ? "copy" : "edit"));
    });
  }, []);

  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const activeItems = useMemo(
    () => items.filter((item) => item.posting_group_id === activeGroup?.id),
    [activeGroup?.id, items],
  );
  const scheduledCount = activeItems.filter(
    (item) => item.post_body || item.comment_text || item.asin,
  ).length;
  const postedCount = activeItems.filter((item) => item.status === "posted").length;
  const hasUnsavedChanges = Object.entries(drafts).some(([key, draft]) => {
    const [groupId, hour] = key.split(":");
    const item = items.find(
      (candidate) =>
        candidate.posting_group_id === groupId && candidate.schedule_hour === Number(hour),
    );
    return !itemMatchesDraft(item, draft);
  });

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  function setViewMode(next: ViewMode) {
    setMode(next);
    window.localStorage.setItem("dealSchedule.viewMode", next);
  }

  function updateDraft(groupId: string, hour: number, change: Partial<Draft>) {
    const key = keyFor(groupId, hour);
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] || EMPTY_DRAFT), ...change },
    }));
  }

  async function loadDate(nextDate: string) {
    if (hasUnsavedChanges && !window.confirm("Leave this day and discard unsaved edits?")) return;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/deal-schedule?date=${nextDate}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as ScheduleDay & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load that day.");
      setDate(nextDate);
      setGroups(data.groups);
      setItems(data.items);
      setDrafts(draftsFor(data.items, data.groups));
      if (!data.groups.some((group) => group.id === activeGroupId)) {
        setActiveGroupId(data.groups[0]?.id || "");
      }
      window.history.replaceState(null, "", `/admin/deal-schedule?date=${nextDate}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load that day.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSlot(groupId: string, hour: number, statusOverride?: ScheduleStatus) {
    const key = keyFor(groupId, hour);
    const draft = drafts[key] || EMPTY_DRAFT;
    const status = statusOverride || draft.status;
    setBusyKey(key);
    setNotice("");
    try {
      const response = await fetch("/api/admin/deal-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postingGroupId: groupId,
          scheduleDate: date,
          scheduleHour: hour,
          postBody: draft.postBody,
          commentText: draft.commentText,
          asin: draft.asin,
          status,
        }),
      });
      const data = (await response.json()) as { item: ScheduleItem | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save this time slot.");

      setItems((current) => {
        const withoutSlot = current.filter(
          (item) => !(item.posting_group_id === groupId && item.schedule_hour === hour),
        );
        return data.item ? [...withoutSlot, data.item] : withoutSlot;
      });
      setDrafts((current) => ({
        ...current,
        [key]: data.item ? draftFromItem(data.item) : { ...EMPTY_DRAFT },
      }));
      setNotice(data.item ? `${formatScheduleHour(hour)} saved.` : `${formatScheduleHour(hour)} cleared.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save this time slot.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCopy(value: string, key: string) {
    if (!value) return;
    try {
      await copyText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    } catch {
      setNotice("Clipboard access was blocked. Try again from the installed app or HTTPS site.");
    }
  }

  if (!activeGroup) {
    return (
      <div className="mt-4 rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/60 p-10 text-center">
        <h1 className="text-2xl font-bold">Deal Schedule</h1>
        <p className="mt-2 text-sm text-zinc-400">No active posting groups are configured yet.</p>
      </div>
    );
  }

  return (
    <section className="mt-2">
      <header className="overflow-hidden rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.13),transparent_38%),#12151c] shadow-2xl shadow-black/20">
        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">Posting desk</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Daily Deal Schedule</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Build the day on desktop. Open copy mode on your phone when it is time to post.
              </p>
            </div>
            <div className="inline-flex w-full rounded-xl border border-zinc-700 bg-zinc-950/70 p-1 lg:w-auto">
              {(["edit", "copy"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setViewMode(view)}
                  className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold capitalize transition lg:flex-none ${
                    mode === view ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {view} mode
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/55 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-2 sm:justify-start">
              <button
                type="button"
                onClick={() => loadDate(shiftDate(date, -1))}
                disabled={loading}
                aria-label="Previous day"
                className="grid size-11 place-items-center rounded-xl bg-zinc-800 text-xl font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => loadDate(dateInEasternTime())}
                disabled={loading}
                className="min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => loadDate(shiftDate(date, 1))}
                disabled={loading}
                aria-label="Next day"
                className="grid size-11 place-items-center rounded-xl bg-zinc-800 text-xl font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                ›
              </button>
            </div>
            <label className="flex min-w-0 flex-col sm:items-end">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{loading ? "Loading…" : displayDate(date)}</span>
              <input
                type="date"
                value={date}
                onChange={(event) => loadDate(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base font-semibold text-white sm:w-auto sm:text-sm"
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-zinc-800 bg-zinc-950/40 px-3 pt-3 sm:px-6">
          <div className="flex min-w-max gap-2" role="tablist" aria-label="Deal groups">
            {groups.map((group) => {
              const selected = group.id === activeGroup.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveGroupId(group.id)}
                  className={`min-h-11 rounded-t-xl border border-b-0 px-5 text-sm font-extrabold transition ${
                    selected
                      ? accentClasses[group.accent]
                      : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                  }`}
                >
                  {group.name}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm">
        <div className="flex items-center gap-4">
          <span><strong className="text-white">{scheduledCount}</strong><span className="text-zinc-500"> / 13 scheduled</span></span>
          <span><strong className="text-emerald-300">{postedCount}</strong><span className="text-zinc-500"> posted</span></span>
        </div>
        <div aria-live="polite" className={`font-semibold ${notice ? "text-amber-300" : "text-zinc-600"}`}>
          {notice || (hasUnsavedChanges ? "Unsaved changes" : "All changes saved")}
        </div>
      </div>

      <div className="mt-4 space-y-3" aria-busy={loading}>
        {SCHEDULE_HOURS.map((hour) => {
          const key = keyFor(activeGroup.id, hour);
          const item = items.find(
            (candidate) => candidate.posting_group_id === activeGroup.id && candidate.schedule_hour === hour,
          );
          const draft = drafts[key] || EMPTY_DRAFT;
          const dirty = !itemMatchesDraft(item, draft);
          const filled = Boolean(draft.postBody || draft.commentText || draft.asin);
          const posted = draft.status === "posted";

          if (mode === "copy") {
            return (
              <article
                key={hour}
                className={`overflow-hidden rounded-2xl border bg-zinc-900/90 ${
                  posted ? "border-emerald-400/40" : filled ? "border-zinc-700" : "border-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black tabular-nums text-white">{formatScheduleHour(hour)}</span>
                    {posted && <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">Posted</span>}
                  </div>
                  {draft.asin && <span className="font-mono text-xs text-zinc-500">{draft.asin}</span>}
                </div>
                {filled ? (
                  <div className="grid gap-3 p-3 md:grid-cols-2">
                    <div className="min-w-0 rounded-xl bg-zinc-950/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Post body</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(draft.postBody, `${key}:post`)}
                          disabled={!draft.postBody}
                          className="min-h-11 rounded-lg bg-amber-300 px-4 text-sm font-extrabold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600"
                        >
                          {copiedKey === `${key}:post` ? "Copied ✓" : "Copy post"}
                        </button>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{draft.postBody || "No post text"}</p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-zinc-950/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Comment</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(draft.commentText, `${key}:comment`)}
                          disabled={!draft.commentText}
                          className="min-h-11 rounded-lg bg-sky-300 px-4 text-sm font-extrabold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600"
                        >
                          {copiedKey === `${key}:comment` ? "Copied ✓" : "Copy comment"}
                        </button>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{draft.commentText || "No comment text"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => saveSlot(activeGroup.id, hour, posted ? "planned" : "posted")}
                      disabled={busyKey === key}
                      className={`min-h-11 rounded-xl text-sm font-bold md:col-span-2 ${
                        posted ? "bg-zinc-800 text-zinc-300" : "bg-emerald-400/15 text-emerald-300"
                      }`}
                    >
                      {busyKey === key ? "Saving…" : posted ? "Mark as planned" : "Mark posted"}
                    </button>
                  </div>
                ) : (
                  <p className="px-4 py-5 text-sm text-zinc-600">Open edit mode to schedule this hour.</p>
                )}
              </article>
            );
          }

          return (
            <article
              key={hour}
              className={`rounded-2xl border bg-zinc-900/90 p-4 transition sm:p-5 ${
                dirty ? "border-amber-300/50" : posted ? "border-emerald-400/35" : "border-zinc-800"
              }`}
            >
              <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[7rem_minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="flex items-center justify-between gap-3 xl:block">
                  <div>
                    <p className="text-xl font-black tabular-nums">{formatScheduleHour(hour)}</p>
                    <p className={`mt-1 text-xs font-bold uppercase tracking-wider ${posted ? "text-emerald-300" : dirty ? "text-amber-300" : "text-zinc-600"}`}>
                      {posted ? "Posted" : dirty ? "Unsaved" : filled ? "Ready" : "Open"}
                    </p>
                  </div>
                  <input
                    value={draft.asin}
                    onChange={(event) => updateDraft(activeGroup.id, hour, { asin: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })}
                    placeholder="ASIN (optional)"
                    aria-label={`${formatScheduleHour(hour)} ASIN`}
                    className="min-h-11 w-40 rounded-xl border border-zinc-700 bg-zinc-950 px-3 font-mono text-sm uppercase text-white outline-none focus:border-amber-300 xl:mt-4 xl:w-full"
                  />
                </div>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Post body</span>
                  <textarea
                    value={draft.postBody}
                    onChange={(event) => updateDraft(activeGroup.id, hour, { postBody: event.target.value })}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveSlot(activeGroup.id, hour);
                    }}
                    placeholder="Write the main deal post…"
                    rows={5}
                    className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-amber-300"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Comment</span>
                  <textarea
                    value={draft.commentText}
                    onChange={(event) => updateDraft(activeGroup.id, hour, { commentText: event.target.value })}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveSlot(activeGroup.id, hour);
                    }}
                    placeholder="Add the link, coupon, or follow-up comment…"
                    rows={5}
                    className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-sky-300"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4 xl:pl-[8rem]">
                <button
                  type="button"
                  onClick={() => saveSlot(activeGroup.id, hour)}
                  disabled={busyKey === key || !dirty}
                  className="min-h-11 rounded-xl bg-amber-300 px-5 text-sm font-extrabold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600"
                >
                  {busyKey === key ? "Saving…" : dirty ? "Save slot" : "Saved"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(draft.postBody, `${key}:post`)}
                  disabled={!draft.postBody}
                  className="min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-200 disabled:text-zinc-600"
                >
                  {copiedKey === `${key}:post` ? "Post copied ✓" : "Copy post"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(draft.commentText, `${key}:comment`)}
                  disabled={!draft.commentText}
                  className="min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-200 disabled:text-zinc-600"
                >
                  {copiedKey === `${key}:comment` ? "Comment copied ✓" : "Copy comment"}
                </button>
                {filled && (
                  <button
                    type="button"
                    onClick={() => saveSlot(activeGroup.id, hour, posted ? "planned" : "posted")}
                    disabled={busyKey === key}
                    className={`min-h-11 rounded-xl px-4 text-sm font-bold ${
                      posted ? "bg-emerald-300 text-zinc-950" : "bg-emerald-400/10 text-emerald-300"
                    }`}
                  >
                    {posted ? "Posted ✓" : "Mark posted"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
