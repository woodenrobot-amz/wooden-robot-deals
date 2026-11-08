const CACHE_NAME = "wooden-robot-shell-v3";
const APP_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/admin-icon-192.png",
  "/icons/admin-icon-512.png",
  "/icons/admin-icon-maskable-512.png",
  "/icons/admin-apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (
          (await caches.match(request)) ||
          (await caches.match("/offline.html"))
        );
      }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
        );
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json();
  if (!data?.expiresAt || Date.now() >= Date.parse(data.expiresAt)) return;

  event.waitUntil(self.registration.showNotification("Posting Desk", {
    body: "It’s been an hour since your last deal post.",
    icon: "/icons/admin-icon-192.png",
    tag: "posting-desk-reminder",
  }));
});

self.addEventListener("notificationclick", (event) => {
  if (event.notification.tag !== "posting-desk-reminder") return;
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/admin/deal-schedule", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const desk = windows.find((client) => client.url === url);
    if (desk) await desk.focus();
    else await self.clients.openWindow(url);
  })());
});
