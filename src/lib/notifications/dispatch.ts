import "server-only";

import { decimalToCents } from "@/lib/catalog/pricing";

import { buildNewOrderPushPayload } from "./payload";

// Envío del push "pedido nuevo" a los dispositivos de admins que lo activaron.
// Se ejecuta DESPUÉS de responder al cliente (after() en POST /api/pedidos): nunca
// cambia el resultado del pedido. Nunca lanza: los errores se registran sin PII ni
// endpoints. Idempotencia: claim_order_push reclama el envío en la base como máximo
// una vez por pedido (aunque el navegador reintente o haya invocaciones simultáneas).
// Ver docs/notifications.md.

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type ClaimedOrder = {
  orderId: string;
  folio: string;
  totalCents: number;
  deliveryType: string;
  subscriptions: PushTarget[];
};

export type PushDeps = {
  /** null = ya reclamado, inexistente o demasiado antiguo: no se envía nada. */
  claim: (orderId: string) => Promise<ClaimedOrder | null>;
  finish: (orderId: string, result: { ok: string[]; failed: string[]; gone: string[] }) => Promise<void>;
  /** Devuelve el código HTTP del servicio push (2xx = entregado al servicio). */
  send: (target: PushTarget, payload: string) => Promise<number>;
};

export type DispatchResult =
  | { status: "not-configured" }
  | { status: "not-claimed" }
  | { status: "error" }
  | { status: "done"; sent: number; failed: number; gone: number };

// 404/410: la suscripción ya no existe (desinstalada, permiso revocado, expirada).
const GONE = new Set([404, 410]);

export async function dispatchNewOrderPush(orderId: string, deps?: PushDeps | null): Promise<DispatchResult> {
  try {
    const resolved = deps === undefined ? await defaultDeps() : deps;
    if (!resolved) return { status: "not-configured" };

    const order = await resolved.claim(orderId);
    if (!order) return { status: "not-claimed" };

    const payload = JSON.stringify(buildNewOrderPushPayload(order));
    const results = await Promise.all(
      order.subscriptions.map(async (target) => {
        try {
          return { target, code: await resolved.send(target, payload) };
        } catch (error) {
          const code = (error as { statusCode?: unknown })?.statusCode;
          return { target, code: typeof code === "number" ? code : 0 };
        }
      }),
    );

    const ok = results.filter((r) => r.code >= 200 && r.code < 300).map((r) => r.target.endpoint);
    const gone = results.filter((r) => GONE.has(r.code)).map((r) => r.target.endpoint);
    const failed = results
      .filter((r) => !(r.code >= 200 && r.code < 300) && !GONE.has(r.code))
      .map((r) => r.target.endpoint);

    await resolved.finish(orderId, { ok, failed, gone });
    if (failed.length) console.error(`[push] ${failed.length} envío(s) fallaron para un pedido nuevo`);
    return { status: "done", sent: ok.length, failed: failed.length, gone: gone.length };
  } catch {
    // Sin detalles: el error puede contener endpoints o datos de la base.
    console.error("[push] no se pudo despachar la notificación de un pedido nuevo");
    return { status: "error" };
  }
}

// Dependencias reales: claves VAPID + secreto de despacho (variables de servidor).
// Sin configuración completa, el push se omite (el pedido no se ve afectado).
async function defaultDeps(): Promise<PushDeps | null> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!publicKey || !privateKey || !subject || !secret) return null;

  const [{ default: webpush }, { getPublicSupabase }] = await Promise.all([
    import("web-push"),
    import("@/lib/supabase/public"),
  ]);
  const supabase = getPublicSupabase();
  const vapidDetails = { subject, publicKey, privateKey };

  return {
    async claim(id) {
      const { data, error } = await supabase.rpc("claim_order_push", { p_order_id: id, p_secret: secret });
      if (error) throw new Error("claim_order_push");
      if (!data) return null;
      const row = data as {
        order_id: string;
        folio: string;
        total: string;
        delivery_type: string;
        subscriptions: PushTarget[];
      };
      return {
        orderId: row.order_id,
        folio: row.folio,
        totalCents: decimalToCents(row.total),
        deliveryType: row.delivery_type,
        subscriptions: row.subscriptions,
      };
    },
    async finish(id, result) {
      const { error } = await supabase.rpc("finish_order_push", {
        p_order_id: id,
        p_secret: secret,
        p_ok_endpoints: result.ok,
        p_failed_endpoints: result.failed,
        p_gone_endpoints: result.gone,
      });
      if (error) throw new Error("finish_order_push");
    },
    async send(target, payload) {
      const response = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        // Un aviso de pedido de hace horas ya no es útil: el panel tiene la lista.
        { vapidDetails, TTL: 60 * 60, urgency: "high" },
      );
      return response.statusCode;
    },
  };
}
