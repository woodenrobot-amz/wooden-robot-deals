"use client";

import { useState } from "react";

type Draft = {
  asin: string;
  postBody: string;
  commentText: string;
};

const EMPTY_DRAFT: Draft = {
  asin: "",
  postBody: "",
  commentText: "",
};

export function UnplannedPostTracker() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  function updateDraft(change: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function toggleOpen() {
    setNotice("");
    if (open) {
      setOpen(false);
      setDraft(EMPTY_DRAFT);
      return;
    }
    setOpen(true);
  }

  async function saveUnplannedPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/post-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin: draft.asin,
          postBody: draft.postBody,
          commentText: draft.commentText,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not record the post.");

      setDraft(EMPTY_DRAFT);
      setOpen(false);
      setNotice(`${draft.asin} recorded.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not record the post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-2 rounded-2xl border border-zinc-800 bg-zinc-900/65 px-4 py-3 shadow-lg shadow-black/10 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Unplanned post</p>
          {!open && <p className="mt-1 text-xs text-zinc-500">Log a deal posted outside the schedule.</p>}
        </div>
        <button
          type="button"
          onClick={toggleOpen}
          className="min-h-11 rounded-xl bg-sky-300 px-4 text-sm font-extrabold text-zinc-950"
        >
          {open ? "Cancel" : "+ Log Post"}
        </button>
      </div>

      {notice && (
        <p aria-live="polite" className="mt-2 text-sm font-semibold text-emerald-300">
          {notice}
        </p>
      )}

      {open && (
        <form onSubmit={saveUnplannedPost} className="mt-3 border-t border-zinc-800 pt-4">
          <div className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)]">
            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">ASIN *</span>
              <input
                autoFocus
                required
                minLength={10}
                maxLength={10}
                value={draft.asin}
                onChange={(event) =>
                  updateDraft({
                    asin: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
                  })
                }
                placeholder="B0XXXXXXXX"
                className="mt-2 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 font-mono uppercase text-white outline-none focus:border-sky-300"
              />
            </label>

            <label>
              <span className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                <span>Post text <span className="font-normal normal-case tracking-normal">(optional)</span></span>
                <span className="font-semibold normal-case tracking-normal text-zinc-500">
                  <span className={draft.postBody.length > 130 ? "text-red-400" : undefined}>{draft.postBody.length}</span>/130
                </span>
              </span>
              <textarea
                rows={3}
                value={draft.postBody}
                onChange={(event) => updateDraft({ postBody: event.target.value })}
                placeholder="Paste post text if useful…"
                className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-sky-300"
              />
            </label>

            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Comment text <span className="font-normal normal-case tracking-normal">(optional)</span>
              </span>
              <textarea
                rows={3}
                value={draft.commentText}
                onChange={(event) => updateDraft({ commentText: event.target.value })}
                placeholder="Paste comment text if useful…"
                className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-sky-300"
              />
            </label>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={saving || draft.asin.length !== 10}
              className="min-h-11 rounded-xl bg-emerald-300 px-5 text-sm font-extrabold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              {saving ? "Saving…" : "Record post"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
