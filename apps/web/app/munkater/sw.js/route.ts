// The service worker of the workspace (scope `/munkater/`, music merge phase 5d): it only shows the
// push of a live session and opens its link. It has no cache and no fetch handler. The script is
// served from this path so that the default scope is the workspace; public hosts never register it.
const SCRIPT = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (!data || typeof data.title !== "string") return;
  const url = typeof data.url === "string" && data.url.startsWith("/munkater/") ? data.url : "/munkater/";
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/munkater/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/munkater/",
      "Cache-Control": "no-store",
    },
  });
}
