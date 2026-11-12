"use client";

import { useEffect, useState } from "react";
import { DEFAULT_REMINDER_TIMES, nextReminderLabel } from "@/lib/posting-reminder";

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
  const [times, setTimes] = useState<string[]>(DEFAULT_REMINDER_TIMES);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
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
        if (!response.ok) throw new Error("Could not load the reminder schedule.");
        const result = await response.json();
        if (controller.signal.aborted) return;
        setTimes(result.times);
        setLoaded(true);
        setPublicKey(result.publicKey);
      } catch {
        if (!controller.signal.aborted) setMessage("Could not load the reminder schedule. Retrying…");
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

  async function saveSchedule() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ times: draft ?? times }),
      });
      if (!response.ok) throw new Error("Could not save the reminder schedule.");
      const result = await response.json();
      setTimes(result.times);
      setDraft(null);
      setMessage("Daily schedule saved for all your devices.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save schedule.");
    } finally { setSaving(false); }
  }

  const timer = loaded && now ? nextReminderLabel(times, now) : "Loading reminder schedule…";
  const editing = draft ?? times;

  if (!showSettings) {
    return (
      <p className="mt-3 px-1 text-sm tabular-nums text-zinc-400">
        <span className="font-semibold text-zinc-100">{timer}</span>
      </p>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
      <h2 className="text-base font-bold text-white">Push reminders</h2>
      <p className="mt-1">Daily reminders at your chosen times, regardless of when you last posted. All times are Eastern (EST/EDT), including daylight saving changes.</p>
      <fieldset disabled={!loaded || saving} className="mt-4">
        <legend className="font-semibold text-zinc-200">Daily schedule · Eastern time</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {editing.map((time, index) => (
            <div key={index} className="flex gap-2">
              <input type="time" aria-label={`Reminder ${index + 1}`} value={time}
                onChange={(event) => setDraft(editing.map((item, i) => i === index ? event.target.value : item))}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-white [color-scheme:dark]" />
              <button type="button" aria-label={`Remove reminder ${index + 1}`}
                onClick={() => setDraft(editing.filter((_, i) => i !== index))}
                className="min-h-11 rounded-lg bg-zinc-800 px-3 text-zinc-200">Remove</button>
            </div>
          ))}
        </div>
        {!editing.length && <p className="mt-2">No reminders scheduled. Add a time to resume daily reminders.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={editing.length >= 48} onClick={() => setDraft([...editing, "12:00"])}
            className="min-h-11 rounded-lg bg-zinc-800 px-3 text-zinc-200">Add time</button>
          <button type="button" disabled={!draft || editing.some((time) => !time)} onClick={saveSchedule}
            className="min-h-11 rounded-lg bg-emerald-700 px-3 font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save schedule"}</button>
          {draft && <button type="button" onClick={() => setDraft(null)} className="min-h-11 px-3">Cancel</button>}
        </div>
      </fieldset>
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
