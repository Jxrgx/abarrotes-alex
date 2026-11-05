import { businessDayKey, businessLocalToIso } from "@/lib/datetime";
import { Constants } from "@/types/database";

import type { DeliveryType, OrderStatus } from "../orders/status";

// Filtros del listado de pedidos (Fase 8E). La URL es la fuente de verdad:
//   /admin/pedidos?estado=new&entrega=pickup&periodo=hoy&q=ALEX-000123&page=2
// Puro: lo usa la página (servidor) para consultar y para construir enlaces.

export const ORDER_PAGE_SIZE = 25;
export const ORDER_PERIODS = ["hoy", "7d", "30d", "todos"] as const;
export type OrderPeriod = (typeof ORDER_PERIODS)[number];
export const ORDER_PERIOD_LABELS: Record<OrderPeriod, string> = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  todos: "Todas las fechas",
};

/** "pendientes" agrupa los estados que requieren operación. */
export type OrderStatusFilter = OrderStatus | "pendientes";

export type OrderFilters = {
  status: OrderStatusFilter | null;
  delivery: DeliveryType | null;
  period: OrderPeriod;
  q: string;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function parseOrderFilters(params: Params): OrderFilters {
  const status = first(params.estado);
  const delivery = first(params.entrega);
  const period = first(params.periodo);
  const page = Number.parseInt(first(params.page), 10);
  return {
    status: status === "pendientes" || (Constants.public.Enums.order_status as readonly string[]).includes(status) ? (status as OrderStatusFilter) : null,
    delivery: (Constants.public.Enums.delivery_type as readonly string[]).includes(delivery) ? (delivery as DeliveryType) : null,
    period: (ORDER_PERIODS as readonly string[]).includes(period) ? (period as OrderPeriod) : "todos",
    q: sanitizeOrderSearch(first(params.q)),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

// Solo letras, números, espacios y guion (folio "ALEX-000123"): así el texto nunca
// lleva caracteres con significado en los filtros de PostgREST (, . ( ) * %).
export function sanitizeOrderSearch(value: string) {
  return value.normalize("NFC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function hasActiveFilters(filters: OrderFilters) {
  return Boolean(filters.status || filters.delivery || filters.q || filters.period !== "todos");
}

/** Inicio (ISO) del periodo en el día de negocio de Mérida; null = sin límite. */
export function periodStart(period: OrderPeriod, nowMs: number): string | null {
  if (period === "todos") return null;
  const daysBack = period === "hoy" ? 0 : period === "7d" ? 6 : 29;
  // Día local de Mérida de hace N días, a las 00:00 de Mérida.
  const day = businessDayKey(new Date(nowMs - daysBack * 24 * 60 * 60 * 1000));
  return businessLocalToIso(`${day}T00:00`);
}

// Espejo EXACTO de private.order_search_normalize (migración …001200): minúsculas y sin
// acentos/diéresis en vocales, conservando la ñ ("María Peña" → "maria peña").
const ACCENTED = "áàâäéèêëíìîïóòôöúùûüÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑ";
const PLAIN = "aaaaeeeeiiiioooouuuuaaaaeeeeiiiioooouuuuñ";
const ORDER_SEARCH_MAP = new Map([...ACCENTED].map((char, index) => [char, [...PLAIN][index]]));

export function normalizeOrderSearch(value: string) {
  return [...value.normalize("NFC").toLowerCase()].map((char) => ORDER_SEARCH_MAP.get(char) ?? char).join("");
}

// Condición OR de búsqueda (texto ya saneado): folio, nombre (columna generada
// orders.customer_name_search, sin acentos y con ñ) o teléfono. El teléfono solo se busca
// si el texto no tiene letras: así "ALEX-000123" no trae pedidos cuyo teléfono contenga
// "000123".
export function orderSearchCondition(q: string): string | null {
  if (!q) return null;
  const parts = [`folio.ilike.*${q}*`, `customer_name_search.ilike.*${normalizeOrderSearch(q)}*`];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && !/\p{L}/u.test(q)) parts.push(`customer_phone.ilike.*${digits}*`);
  return parts.join(",");
}

export function ordersHref(filters: Partial<OrderFilters>) {
  const params = new URLSearchParams();
  if (filters.status) params.set("estado", filters.status);
  if (filters.delivery) params.set("entrega", filters.delivery);
  if (filters.period && filters.period !== "todos") params.set("periodo", filters.period);
  if (filters.q) params.set("q", filters.q);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/admin/pedidos?${query}` : "/admin/pedidos";
}
