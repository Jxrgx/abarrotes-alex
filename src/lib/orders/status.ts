import type { Database } from "@/types/database";

// Estados de pedido: etiquetas, tono visual y definición de "pendiente".
// Única fuente de verdad para la aplicación (y para admin_dashboard, que recibe
// PENDING_ORDER_STATUSES como parámetro).

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Nuevo",
  confirmed: "Confirmado",
  preparing: "Preparando",
  ready: "Listo",
  on_the_way: "En camino",
  ready_for_pickup: "Listo para recoger",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

/** Requieren operación (todo excepto entregado y cancelado). */
export const PENDING_ORDER_STATUSES: OrderStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "on_the_way",
  "ready_for_pickup",
];

export type StatusTone = "brand" | "neutral" | "warning" | "success" | "danger";

// Pocos tonos (sin arcoíris): el texto del estado siempre acompaña al color.
export const ORDER_STATUS_TONES: Record<OrderStatus, StatusTone> = {
  new: "brand",
  confirmed: "neutral",
  preparing: "warning",
  ready: "success",
  on_the_way: "brand",
  ready_for_pickup: "success",
  delivered: "success",
  cancelled: "danger",
};

export function isPendingStatus(status: OrderStatus) {
  return PENDING_ORDER_STATUSES.includes(status);
}

export const DELIVERY_TYPE_LABELS: Record<Database["public"]["Enums"]["delivery_type"], string> = {
  delivery: "Domicilio",
  pickup: "Recoger",
};

export type DeliveryType = Database["public"]["Enums"]["delivery_type"];

// ---------------------------------------------------------------------------
// Máquina de estados (Fase 8E). ESPEJO de private.order_status_transition_allowed
// (migración …001100): la UI solo ofrece estas transiciones, pero la base es la
// autoridad (trigger + update_order_status). Si cambias una, cambia la otra.
//
//   delivery: new → confirmed → preparing → ready → on_the_way       → delivered
//   pickup:   new → confirmed → preparing → ready → ready_for_pickup → delivered
//   cancelled desde cualquier estado no final; delivered y cancelled son finales.

export const FINAL_ORDER_STATUSES: OrderStatus[] = ["delivered", "cancelled"];

export function isFinalStatus(status: OrderStatus) {
  return FINAL_ORDER_STATUSES.includes(status);
}

/** Siguiente estado operativo (avance), o null si es final. */
export function nextOrderStatus(deliveryType: DeliveryType, status: OrderStatus): OrderStatus | null {
  switch (status) {
    case "new":
      return "confirmed";
    case "confirmed":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return deliveryType === "delivery" ? "on_the_way" : "ready_for_pickup";
    // Cada rama solo termina por su propio camino (igual que en la base).
    case "on_the_way":
      return deliveryType === "delivery" ? "delivered" : null;
    case "ready_for_pickup":
      return deliveryType === "pickup" ? "delivered" : null;
    default:
      return null;
  }
}

export function canTransition(deliveryType: DeliveryType, from: OrderStatus, to: OrderStatus) {
  if (isFinalStatus(from)) return false;
  if (to === "cancelled") return true;
  return nextOrderStatus(deliveryType, from) === to;
}

/** Texto del botón que lleva AL estado indicado. */
export const ORDER_ACTION_LABELS: Record<OrderStatus, string> = {
  new: "Nuevo",
  confirmed: "Confirmar pedido",
  preparing: "Empezar a preparar",
  ready: "Marcar listo",
  on_the_way: "Enviar (en camino)",
  ready_for_pickup: "Listo para recoger",
  delivered: "Marcar entregado",
  cancelled: "Cancelar pedido",
};

/** Aviso tras el cambio. */
export const ORDER_STATUS_TOASTS: Record<OrderStatus, string> = {
  new: "Pedido actualizado",
  confirmed: "Pedido confirmado",
  preparing: "Pedido en preparación",
  ready: "Pedido listo",
  on_the_way: "Pedido en camino",
  ready_for_pickup: "Pedido listo para recoger",
  delivered: "Pedido entregado",
  cancelled: "Pedido cancelado",
};
