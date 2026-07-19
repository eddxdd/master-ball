/// <reference lib="webworker" />
/**
 * Custom service worker (Phase 3's Web Push nudges) — replaces vite-plugin-pwa's
 * default generateSW output. Uses the injectManifest strategy so this file (not
 * an auto-generated one) owns the SW's actual code: precaching stays exactly
 * the same as generateSW would have produced, but we can also listen for
 * `push` events, which a plain generateSW config can't do.
 *
 * See Docs/frontend/README.md's "Web Push (Phase 3)" section and
 * Backend/app/tools/push.py, which sends the `{title, body}` JSON payload
 * this file expects.
 */
import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event: PushEvent) => {
  let payload: { title?: string; body?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title || "Master Ball";
  const options: NotificationOptions = {
    body: payload.body || "",
    icon: "/favicon-192.png",
    badge: "/favicon-32.png",
    tag: "masterball-tilt-nudge",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) return (existing as WindowClient).focus();
      return self.clients.openWindow("/");
    }),
  );
});

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});
