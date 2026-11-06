// Service Worker de Abarrotes Alex. Responsabilidad ÚNICA: notificaciones push de
// pedidos nuevos para el panel. No hay handler de fetch: nada se cachea (ni el panel,
// ni pedidos, ni Auth, ni APIs) y no hay modo offline. Ver docs/notifications.md.

// Solo se abren rutas internas del panel: nunca una URL que venga de fuera.
const ORDER_PATH = /^\/admin\/pedidos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK_PATH = "/admin/pedidos";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function safePath(path) {
  return typeof path === "string" && ORDER_PATH.test(path) ? path : FALLBACK_PATH;
}

function isAdminWindow(client) {
  try {
    return new URL(client.url).pathname.startsWith("/admin");
  } catch {
    return false;
  }
}

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  const title = data && typeof data.title === "string" ? data.title : "Nuevo pedido";
  const body = data && typeof data.body === "string" ? data.body : "";
  const path = safePath(data && data.url);
  const orderId = data && typeof data.orderId === "string" ? data.orderId : null;
  const folio = data && typeof data.folio === "string" ? data.folio : null;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // El panel abierto muestra su propio aviso (con deduplicación por pedido).
      for (const client of windows) {
        if (isAdminWindow(client)) client.postMessage({ type: "order-push", orderId, folio });
      }
      // Si el panel está a la vista, no se duplica con una notificación del sistema.
      const visibleAdmin = windows.some(
        (client) => isAdminWindow(client) && client.focused && client.visibilityState === "visible",
      );
      if (visibleAdmin) return;
      await self.registration.showNotification(title, {
        body,
        icon: "/brand/icon-192.png",
        tag: data && typeof data.tag === "string" ? data.tag : undefined,
        lang: "es-MX",
        data: { path },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.path);
  const url = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find(isAdminWindow);
      if (existing) {
        await existing.focus();
        try {
          await existing.navigate(url);
        } catch {
          // Ventana no controlada por este SW: la app navega al recibir el mensaje.
          existing.postMessage({ type: "navigate", path });
        }
        return;
      }
      // Cerrado: se abre el pedido; proxy/Auth deciden si hace falta iniciar sesión.
      await self.clients.openWindow(url);
    })(),
  );
});
