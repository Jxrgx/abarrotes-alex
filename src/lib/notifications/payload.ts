import { formatCents } from "@/lib/format";

// Contenido de la notificación push de un pedido nuevo. SIN datos personales del
// cliente (nombre, teléfono, dirección, referencias, notas): solo folio, total y tipo
// de entrega. El detalle se consulta en el panel, con sesión de admin.
// Ver docs/notifications.md.

export type NewOrderPush = {
  title: string;
  body: string;
  /** Ruta interna del panel (relativa, mismo origen). */
  url: string;
  /** Agrupa/evita duplicados del mismo pedido en el sistema de notificaciones. */
  tag: string;
  orderId: string;
  folio: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DELIVERY_LABELS: Record<string, string> = {
  delivery: "Entrega a domicilio",
  pickup: "Recoger en sucursal",
};

export function buildNewOrderPushPayload(order: {
  orderId: string;
  folio: string;
  totalCents: number;
  deliveryType: string;
}): NewOrderPush {
  if (!UUID.test(order.orderId)) throw new Error("orderId inválido");
  const delivery = DELIVERY_LABELS[order.deliveryType] ?? "Pedido";
  return {
    title: `Nuevo pedido ${order.folio}`,
    body: `${formatCents(order.totalCents)} · ${delivery}`,
    url: `/admin/pedidos/${order.orderId}`,
    tag: `pedido-${order.orderId}`,
    orderId: order.orderId,
    folio: order.folio,
  };
}
