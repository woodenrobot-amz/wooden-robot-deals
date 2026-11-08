"use client";

import { useEffect, useState } from "react";
import { reminderDueAt } from "@/lib/posting-reminder";

const endpoint = "/api/admin/posting-reminders";

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...subscription.toJSON(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!response.ok) throw new Error("Could not register this device for reminders.");
}

export function PostingReminder({ revision, showSettings }: { revision: number; showSettings: boolean }) {
  const [now, setNow] = useState(0);
  const [postedAt, setPostedAt] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      setNow(Date.now());
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (controller.signal.aborted) return;
        setPostedAt(result.postedAt);
        setPublicKey(result.publicKey);
      } catch {
        // The next refresh will try again after a connection interruption.
      }
    }
    void refresh();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(clock);
      window.clearInterval(poll);
      window.removeEventListener("focus", refresh);
    };
  }, [revision]);

  useEffect(() => {
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) ||
        !("Notification" in window)) return;
    let cancelled = false;
    void navigator.serviceWorker.ready.then(async (registration) => {
      if (cancelled) return;
      setSupported(true);
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || cancelled || Notification.permission !== "granted") return;
      await saveSubscription(subscription);
      if (!cancelled) setEnabled(true);
    }).catch(() => {
      if (!cancelled) setMessage("Could not sync push settings on this device.");
    });
    return () => { cancelled = true; };
  }, [publicKey]);

  async function toggleReminders() {
    if (!publicKey) return;
    setBusy(true);
    setMessage("");
    try {
      if (!enabled && await Notification.requestPermission() !== "granted") {
        throw new Error("Allow notifications in your browser settings to enable reminders.");
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (enabled) {
        if (existing) {
          const response = await fetch(endpoint, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: existing.endpoint }),
          });
          if (!response.ok) throw new Error("Could not disable reminders.");
          await existing.unsubscribe();
        }
        setEnabled(false);
      } else {
        const subscription = existing || await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: publicKey,
        });
        await saveSubscription(subscription);
        setEnabled(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update push settings.");
    } finally {
      setBusy(false);
    }
  }

  const due = postedAt && now ? reminderDueAt(postedAt, now) : null;
  const seconds = due ? Math.max(0, Math.ceil((due - now) / 1000)) : 0;
  const localHour = new Date(now).getHours();
  let timer = "Waiting for a post";
  if (now && (localHour < 7 || localHour >= 20)) timer = "Outside reminder hours";
  else if (due && seconds === 0) timer = "An hour since the last post";
  else if (due) timer = `Next reminder in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  else if (localHour >= 19) timer = "Reminder window ends at 8 PM";

  if (!showSettings) {
    return (
      <p className="mt-3 px-1 text-sm tabular-nums text-zinc-400">
        <span className="font-semibold text-zinc-100">{timer}</span> · 7 AM–8 PM local
      </p>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
      <h2 className="text-base font-bold text-white">Push reminders</h2>
      <p className="mt-1">Get a reminder an hour after your last post, between 7 AM and 8 PM local time.</p>
      {supported && (
        <button type="button" disabled={busy} onClick={toggleReminders}
          className="mt-3 min-h-11 rounded-lg bg-zinc-800 px-3 font-semibold text-zinc-200 disabled:opacity-50">
          {enabled ? "Disable push on this device" : "Enable push on this device"}
        </button>
      )}
      {!publicKey && <p className="mt-2">Push setup is pending.</p>}
      {message && <p className="mt-2 text-amber-300" role="status">{message}</p>}
    </section>
  );
}
