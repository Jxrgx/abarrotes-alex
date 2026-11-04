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
