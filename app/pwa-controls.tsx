"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_DISMISSED_KEY = "woodenRobot.installDismissedAt";
const INSTALL_DISMISS_DAYS = 30;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function PwaControls({ version }: { version: string }) {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const dismissedAt = Number(
      window.localStorage.getItem(INSTALL_DISMISSED_KEY) || 0,
    );
    const canPrompt =
      Date.now() - dismissedAt >
      INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (ios && !isStandalone() && canPrompt) {
      setShowIosInstall(true);
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (canPrompt && !isStandalone()) {
        setInstallEvent(event as BeforeInstallPromptEvent);
      }
    };
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        registration.update();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
            }
          });
        });
      });
    }

    const checkVersion = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const data = (await response.json()) as { version?: string };
        if (
          version !== "development" &&
          data.version &&
          data.version !== version
        ) {
          setUpdateAvailable(true);
        }
      } catch {
        // Connection state is handled separately.
      }
    };
    const timer = window.setInterval(checkVersion, 5 * 60 * 1000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(timer);
    };
  }, [version]);

  function dismissInstall() {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
    setInstallEvent(null);
    setShowIosInstall(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <>
      {offline && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-bold text-zinc-950">
          You’re offline. Showing what’s already loaded.
        </div>
      )}

      {updateAvailable && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
          <div>
            <div className="font-bold text-white">Update ready</div>
            <div className="text-sm text-zinc-400">
              Reload for the newest deals experience.
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950"
          >
            Update
          </button>
        </div>
      )}

      {!updateAvailable && (installEvent || showIosInstall) && (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
          <div className="font-bold text-white">Install Wooden Robot</div>
          <div className="mt-1 text-sm text-zinc-400">
            {showIosInstall
              ? "Tap Share, then Add to Home Screen."
              : "Keep the deals feed one tap away."}
          </div>
          <div className="mt-3 flex gap-2">
            {installEvent && (
              <button
                onClick={install}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950"
              >
                Install
              </button>
            )}
            <button
              onClick={dismissInstall}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
