"use client";

import { useActionState } from "react";

export function RescoreButton({ rescore }: { rescore: () => Promise<string> }) {
  const [message, action, pending] = useActionState(rescore, "");

  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-bold text-amber-300 disabled:opacity-50"
      >
        {pending ? "Rescoring…" : "Rescore"}
      </button>
      <p role="status" className="text-sm text-zinc-400">
        {pending ? "Applying current tiers to queued and live deals." : message || "Apply current tiers to queued and live deals."}
      </p>
    </form>
  );
}
