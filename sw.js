/* MindSpace — service worker
   Dipakai untuk menampilkan notifikasi (wajib di Android/Chrome) dan
   membuka halaman yang sesuai saat notifikasi diketuk. Tidak melakukan caching. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const hash =
    (event.notification.data && event.notification.data.hash) || "#dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "navigate", hash });
          return;
        }
      }
      if (self.clients.openWindow)
        await self.clients.openWindow(self.registration.scope + hash);
    })(),
  );
});
