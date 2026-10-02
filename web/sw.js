// Minimal service worker so iPhone/Android can install the dashboard as an app.
// Data is always fetched live; nothing is cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
