"use client";

import { useState } from "react";

export function GeneratePageButton({ scheduleDate }: { scheduleDate: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/deal-schedule/generate-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleDate }),
      });
      const data = (await response.json()) as { generated?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not generate Page posts.");
      setMessage(`${data.generated || 0} Page posts generated. Bodies are copied for Phase 1; comments are preserved exactly.`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate Page posts.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-white">Woodworking Page</p>
        <p className="text-xs text-zinc-400">Phase 1 shuffles populated Woodworking hours and copies comments exactly. Post bodies are copied until the rewrite step is added.</p>
        {message ? <p className="mt-1 text-xs font-semibold text-rose-200">{message}</p> : null}
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="min-h-11 shrink-0 rounded-xl bg-rose-300 px-4 text-sm font-extrabold text-zinc-950 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Generating…" : "Generate from Woodworking"}
      </button>
    </div>
  );
}
