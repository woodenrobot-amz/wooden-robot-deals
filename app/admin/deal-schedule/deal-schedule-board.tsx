"use client";

import { useEffect, useMemo, useState } from "react";
import {
  dateInEasternTime,
  formatScheduleHour,
  recurringDailySlot,
  SCHEDULE_HOURS,
  type PostingGroup,
  type ScheduleDay,
  type ScheduleItem,
  type ScheduleStatus,
} from "@/lib/deal-schedule";

type DraftComment = {
  commentText: string;
  asin: string;
};

type Draft = {
  postBody: string;
  comments: DraftComment[];
  status: ScheduleStatus;
};

type ViewMode = "edit" | "copy";

const MAX_COMMENTS = 5;

function emptyComment(): DraftComment {
  return { commentText: "", asin: "" };
}

function emptyDraft(): Draft {
  return { postBody: "", comments: [emptyComment()], status: "planned" };
}

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

function normalizedComments(item?: ScheduleItem): DraftComment[] {
  if (!item) return [emptyComment()];
  const comments = [...(item.deal_schedule_comments || [])]
    .sort((a, b) => a.position - b.position)
    .map((comment) => ({
      commentText: comment.comment_text || "",
      asin: comment.asin || "",
    }));

  if (comments.length) return comments;
  if (item.comment_text || item.asin) {
    return [{ commentText: item.comment_text || "", asin: item.asin || "" }];
  }
  return [emptyComment()];
}

function draftFromItem(item?: ScheduleItem, group?: PostingGroup, hour?: number): Draft {
  if (!item) {
    const recurring = group && hour !== undefined ? recurringDailySlot(group.slug, hour) : null;
    return recurring
      ? {
          postBody: recurring.postBody,
          comments: [{ commentText: recurring.commentText, asin: "" }],
          status: "planned",
        }
      : emptyDraft();
  }
  return {
    postBody: item.post_body,
    comments: normalizedComments(item),
    status: item.status,
  };
}

function itemMatchesDraft(
  item: ScheduleItem | undefined,
  draft: Draft,
  group?: PostingGroup,
  hour?: number,
) {
  const saved = draftFromItem(item, group, hour);
  if (saved.postBody !== draft.postBody || saved.status !== draft.status) return false;
  if (saved.comments.length !== draft.comments.length) return false;
  return saved.comments.every(
    (comment, index) =>
      comment.commentText === draft.comments[index]?.commentText &&
      comment.asin === draft.comments[index]?.asin,
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
        group,
        hour,
      );
    }
  }
  return next;
}

function PostCharacterCount({ length }: { length: number }) {
  return (
    <span className="text-xs font-semibold tabular-nums text-zinc-500" aria-label={`${length} of 130 characters`}>
      <span className={length > 130 ? "text-red-400" : undefined}>{length}</span>/130
    </span>
  );
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
  const [expandedPostedKeys, setExpandedPostedKeys] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const savedMode = window.localStorage.getItem("dealSchedule.viewMode") as ViewMode | null;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const compactScreen = window.matchMedia("(max-width: 767px)").matches;
    queueMicrotask(() => setMode(savedMode || (standalone || compactScreen ? "copy" : "edit")));
  }, []);

  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const activeItems = useMemo(
    () => items.filter((item) => item.posting_group_id === activeGroup?.id),
    [activeGroup?.id, items],
  );
  const scheduledCount = SCHEDULE_HOURS.filter((hour) => {
    const draft = drafts[keyFor(activeGroup.id, hour)] || emptyDraft();
    return draft.postBody || draft.comments.some((comment) => comment.commentText || comment.asin);
  }).length;
  const postedCount = activeItems.filter((item) => item.status === "posted").length;
  const hasUnsavedChanges = Object.entries(drafts).some(([key, draft]) => {
    const [groupId, hour] = key.split(":");
    const item = items.find(
      (candidate) => candidate.posting_group_id === groupId && candidate.schedule_hour === Number(hour),
    );
    const group = groups.find((candidate) => candidate.id === groupId);
    return !itemMatchesDraft(item, draft, group, Number(hour));
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
      [key]: { ...(current[key] || emptyDraft()), ...change },
    }));
  }

  function updateComment(groupId: string, hour: number, index: number, change: Partial<DraftComment>) {
    const key = keyFor(groupId, hour);
    setDrafts((current) => {
      const draft = current[key] || emptyDraft();
      const comments = draft.comments.map((comment, commentIndex) =>
        commentIndex === index ? { ...comment, ...change } : comment,
      );
      return { ...current, [key]: { ...draft, comments } };
    });
  }

  function addComment(groupId: string, hour: number) {
    const key = keyFor(groupId, hour);
    setDrafts((current) => {
      const draft = current[key] || emptyDraft();
      if (draft.comments.length >= MAX_COMMENTS) return current;
      return { ...current, [key]: { ...draft, comments: [...draft.comments, emptyComment()] } };
    });
  }

  function removeComment(groupId: string, hour: number, index: number) {
    const key = keyFor(groupId, hour);
    setDrafts((current) => {
      const draft = current[key] || emptyDraft();
      const comments = draft.comments.filter((_, commentIndex) => commentIndex !== index);
      return {
        ...current,
        [key]: { ...draft, comments: comments.length ? comments : [emptyComment()] },
      };
    });
  }

  async function loadDate(nextDate: string) {
    if (hasUnsavedChanges && !window.confirm("Leave this day and discard unsaved edits?")) return;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/deal-schedule?date=${nextDate}`, { cache: "no-store" });
      const data = (await response.json()) as ScheduleDay & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load that day.");
      setDate(nextDate);
      setGroups(data.groups);
      setItems(data.items);
      setDrafts(draftsFor(data.items, data.groups));
      setExpandedPostedKeys(new Set());
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
    const draft = drafts[key] || emptyDraft();
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
          comments: draft.comments,
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
        [key]: data.item ? draftFromItem(data.item) : emptyDraft(),
      }));
      if (status === "posted" && mode === "copy") {
        setExpandedPostedKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
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
              <button type="button" onClick={() => loadDate(shiftDate(date, -1))} disabled={loading} aria-label="Previous day" className="grid size-11 place-items-center rounded-xl bg-zinc-800 text-xl font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">‹</button>
              <button type="button" onClick={() => loadDate(dateInEasternTime())} disabled={loading} className="min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">Today</button>
              <button type="button" onClick={() => loadDate(shiftDate(date, 1))} disabled={loading} aria-label="Next day" className="grid size-11 place-items-center rounded-xl bg-zinc-800 text-xl font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">›</button>
            </div>
            <label className="flex min-w-0 flex-col sm:items-end">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{loading ? "Loading…" : displayDate(date)}</span>
              <input type="date" value={date} onChange={(event) => loadDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base font-semibold text-white sm:w-auto sm:text-sm" />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-zinc-800 bg-zinc-950/40 px-3 pt-3 sm:px-6">
          <div className="flex min-w-max gap-2" role="tablist" aria-label="Deal groups">
            {groups.map((group) => {
              const selected = group.id === activeGroup.id;
              return (
                <button key={group.id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveGroupId(group.id)} className={`min-h-11 rounded-t-xl border border-b-0 px-5 text-sm font-extrabold transition ${selected ? accentClasses[group.accent] : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"}`}>
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
          const draft = drafts[key] || emptyDraft();
          const dirty = !itemMatchesDraft(item, draft, activeGroup, hour);
          const filled = Boolean(draft.postBody || draft.comments.some((comment) => comment.commentText || comment.asin));
          const posted = draft.status === "posted";
          const recurring = recurringDailySlot(activeGroup.slug, hour);
          const collapsed = mode === "copy" && posted && !expandedPostedKeys.has(key);

          if (mode === "copy") {
            return (
              <article key={hour} className={`overflow-hidden rounded-2xl border bg-zinc-900/90 ${posted ? "border-emerald-400/40" : filled ? "border-zinc-700" : "border-zinc-800"}`}>
                <div className={`flex items-center justify-between px-4 py-3 ${collapsed ? "" : "border-b border-zinc-800"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black tabular-nums text-white">{formatScheduleHour(hour)}</span>
                    {recurring && <span className="text-xs font-bold text-amber-300">{recurring.label}</span>}
                    {posted && <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">Posted</span>}
                    {draft.comments.length > 1 && <span className="text-xs font-bold text-sky-300">{draft.comments.length} comments</span>}
                  </div>
                  {posted && (
                    <button type="button" onClick={() => setExpandedPostedKeys((current) => { const next = new Set(current); collapsed ? next.add(key) : next.delete(key); return next; })} className="min-h-11 rounded-lg bg-zinc-800 px-3 text-xs font-bold text-zinc-200">
                      {collapsed ? "Show" : "Collapse"}
                    </button>
                  )}
                </div>
                {!collapsed && (filled ? (
                  <div className="space-y-3 p-3">
                    <div className="min-w-0 rounded-xl bg-zinc-950/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Post body</span><PostCharacterCount length={draft.postBody.length} /></div>
                        <button type="button" onClick={() => handleCopy(draft.postBody, `${key}:post`)} disabled={!draft.postBody} className="min-h-11 rounded-lg bg-amber-300 px-4 text-sm font-extrabold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600">{copiedKey === `${key}:post` ? "Copied ✓" : "Copy post"}</button>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{draft.postBody || "No post text"}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {draft.comments.map((comment, index) => (
                        <div key={index} className="min-w-0 rounded-xl bg-zinc-950/70 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div><span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Comment {index + 1}</span>{comment.asin && <span className="ml-2 font-mono text-[11px] text-zinc-600">{comment.asin}</span>}</div>
                            <button type="button" onClick={() => handleCopy(comment.commentText, `${key}:comment:${index}`)} disabled={!comment.commentText} className="min-h-11 rounded-lg bg-sky-300 px-4 text-sm font-extrabold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600">{copiedKey === `${key}:comment:${index}` ? "Copied ✓" : `Copy ${index + 1}`}</button>
                          </div>
                          <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{comment.commentText || "No comment text"}</p>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => saveSlot(activeGroup.id, hour, posted ? "planned" : "posted")} disabled={busyKey === key} className={`min-h-11 w-full rounded-xl text-sm font-bold ${posted ? "bg-zinc-800 text-zinc-300" : "bg-emerald-400/15 text-emerald-300"}`}>
                      {busyKey === key ? "Saving…" : posted ? "Mark as planned" : "Mark posted"}
                    </button>
                  </div>
                ) : <p className="px-4 py-5 text-sm text-zinc-600">Open edit mode to schedule this hour.</p>)}
              </article>
            );
          }

          return (
            <article key={hour} className={`rounded-2xl border bg-zinc-900/90 p-4 transition sm:p-5 ${dirty ? "border-amber-300/50" : posted ? "border-emerald-400/35" : "border-zinc-800"}`}>
              <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[7rem_minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="flex items-center justify-between gap-3 xl:block">
                  <div>
                    <p className="text-xl font-black tabular-nums">{formatScheduleHour(hour)}</p>
                    {recurring && <p className="mt-1 text-xs font-bold text-amber-300">{recurring.label}</p>}
                    <p className={`mt-1 text-xs font-bold uppercase tracking-wider ${posted ? "text-emerald-300" : dirty ? "text-amber-300" : "text-zinc-600"}`}>{posted ? "Posted" : dirty ? "Unsaved" : filled ? "Ready" : "Open"}</p>
                    {draft.comments.length > 1 && <p className="mt-2 text-xs font-bold text-sky-300">{draft.comments.length} comments</p>}
                  </div>
                </div>

                <label className="block">
                  <span className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Post body</span><PostCharacterCount length={draft.postBody.length} /></span>
                  <textarea value={draft.postBody} lang="en-US" spellCheck={true} autoCorrect="on" autoCapitalize="sentences" onChange={(event) => updateDraft(activeGroup.id, hour, { postBody: event.target.value })} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveSlot(activeGroup.id, hour); }} placeholder="Write the main deal post…" rows={5} className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-amber-300" />
                </label>

                <div className="space-y-3">
                  {draft.comments.map((comment, index) => (
                    <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950/45 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Comment {index + 1}</span>
                        {draft.comments.length > 1 && (
                          <button type="button" onClick={() => removeComment(activeGroup.id, hour, index)} className="min-h-9 rounded-lg px-2 text-xs font-bold text-zinc-500 hover:bg-zinc-800 hover:text-red-300">Remove</button>
                        )}
                      </div>
                      <textarea value={comment.commentText} lang="en-US" spellCheck={true} autoCorrect="on" autoCapitalize="sentences" onChange={(event) => updateComment(activeGroup.id, hour, index, { commentText: event.target.value })} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveSlot(activeGroup.id, hour); }} placeholder="Add the link, coupon, or follow-up comment…" rows={draft.comments.length > 1 ? 3 : 5} className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-700 focus:border-sky-300" />
                      <input value={comment.asin} onChange={(event) => updateComment(activeGroup.id, hour, index, { asin: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} placeholder="ASIN (optional)" aria-label={`${formatScheduleHour(hour)} Comment ${index + 1} ASIN`} className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 font-mono text-sm uppercase text-white outline-none focus:border-sky-300" />
                    </div>
                  ))}
                  {draft.comments.length < MAX_COMMENTS && (
                    <button type="button" onClick={() => addComment(activeGroup.id, hour)} className="min-h-11 w-full rounded-xl border border-dashed border-zinc-700 text-sm font-bold text-sky-300 hover:border-sky-300/60 hover:bg-sky-300/5">+ Add comment</button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4 xl:pl-[8rem]">
                <button type="button" onClick={() => saveSlot(activeGroup.id, hour)} disabled={busyKey === key || !dirty} className="min-h-11 rounded-xl bg-amber-300 px-5 text-sm font-extrabold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600">{busyKey === key ? "Saving…" : dirty ? "Save slot" : "Saved"}</button>
                <button type="button" onClick={() => handleCopy(draft.postBody, `${key}:post`)} disabled={!draft.postBody} className="min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-200 disabled:text-zinc-600">{copiedKey === `${key}:post` ? "Post copied ✓" : "Copy post"}</button>
                {draft.comments.map((comment, index) => (
                  <button key={index} type="button" onClick={() => handleCopy(comment.commentText, `${key}:comment:${index}`)} disabled={!comment.commentText} className="min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-200 disabled:text-zinc-600">{copiedKey === `${key}:comment:${index}` ? `Comment ${index + 1} copied ✓` : draft.comments.length > 1 ? `Copy comment ${index + 1}` : "Copy comment"}</button>
                ))}
                {filled && (
                  <button type="button" onClick={() => saveSlot(activeGroup.id, hour, posted ? "planned" : "posted")} disabled={busyKey === key} className={`min-h-11 rounded-xl px-4 text-sm font-bold ${posted ? "bg-emerald-300 text-zinc-950" : "bg-emerald-400/10 text-emerald-300"}`}>{posted ? "Posted ✓" : "Mark posted"}</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
