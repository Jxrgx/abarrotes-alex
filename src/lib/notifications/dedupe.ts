// Deduplicación de avisos de pedido nuevo dentro del panel. El mismo pedido puede llegar
// por Realtime (Broadcast) y por el Service Worker (push con el panel abierto), o dos
// veces por reconexión: solo el primero muestra aviso y suena.

export function createSeenOrders(limit = 50) {
  const seen: string[] = [];
  return {
    /** true la primera vez que se ve el pedido; false si ya se avisó. */
    markNew(orderId: string | null | undefined): boolean {
      if (!orderId || seen.includes(orderId)) return false;
      seen.push(orderId);
      if (seen.length > limit) seen.shift();
      return true;
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLIO = /^ALEX-\d{6,}$/;

/** Evento mínimo { order_id, folio } de Realtime o del Service Worker; null si no es válido. */
export function parseOrderEvent(payload: unknown): { orderId: string; folio: string | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const orderId = record.order_id ?? record.orderId;
  if (typeof orderId !== "string" || !UUID.test(orderId)) return null;
  const folio = typeof record.folio === "string" && FOLIO.test(record.folio) ? record.folio : null;
  return { orderId, folio };
}
