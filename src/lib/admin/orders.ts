import "server-only";

import { toCents } from "@/lib/catalog/pricing";
import { PENDING_ORDER_STATUSES, type DeliveryType, type OrderStatus } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";

import { ORDER_PAGE_SIZE, type OrderFilters, orderSearchCondition, periodStart } from "./order-filters";

// Pedidos del panel (Fase 8E). Datos PERSONALES: solo con el cliente autenticado del
// admin (RLS: private.is_admin()). Nunca se registran en logs (solo códigos de error),
// nunca van a la tienda pública y el listado no incluye dirección.

export type AdminOrderRow = {
  id: string;
  folio: string;
  customerName: string;
  deliveryType: DeliveryType;
  status: OrderStatus;
  totalCents: number;
  shippingPending: boolean;
  createdAt: string;
};

function queryError(what: string, code: string | undefined): never {
  console.error(`[admin] ${what}: ${code ?? "sin código"}`); // nunca datos del pedido
  throw new Error(`No se pudieron cargar ${what}.`);
}

// Lo mínimo del query builder de PostgREST que usan los filtros (página y conteo).
interface FilterBuilder<Q> {
  in(column: string, values: readonly string[]): Q;
  eq(column: string, value: string): Q;
  gte(column: string, value: string): Q;
  or(filters: string): Q;
}

// Paginación y filtros en el SERVIDOR (PostgREST): solo viajan 25 pedidos al navegador.
export async function listAdminOrders(filters: OrderFilters): Promise<{ rows: AdminOrderRow[]; total: number; todayStart: string }> {
  // Hora de la petición (panel dinámico): periodos y "Hoy" en el día de negocio de Mérida.
  const nowMs = Date.now();
  const supabase = await createClient();
  const start = periodStart(filters.period, nowMs);
  const search = orderSearchCondition(filters.q);
  // Mismos filtros para la página y para el conteo.
  const withFilters = <Q extends FilterBuilder<Q>>(query: Q): Q => {
    let q = query;
    if (filters.status === "pendientes") q = q.in("status", PENDING_ORDER_STATUSES);
    else if (filters.status) q = q.eq("status", filters.status);
    if (filters.delivery) q = q.eq("delivery_type", filters.delivery);
    if (start) q = q.gte("created_at", start);
    if (search) q = q.or(search);
    return q;
  };

  const from = (filters.page - 1) * ORDER_PAGE_SIZE;
  const { data, error, count } = await withFilters(
    supabase
      .from("orders")
      .select("id, folio, customer_name, delivery_type, status, total, shipping_cost, created_at", { count: "exact" })
      .order("created_at", { ascending: false }),
  ).range(from, from + ORDER_PAGE_SIZE - 1);

  let total = count ?? 0;
  if (error) {
    // Página fuera de rango (p. ej. ?page=99): PostgREST responde 416 sin conteo.
    if (error.code !== "PGRST103") queryError("los pedidos", error.code);
    const counted = await withFilters(supabase.from("orders").select("id", { count: "exact", head: true }));
    if (counted.error) queryError("los pedidos", counted.error.code);
    total = counted.count ?? 0;
  }

  return {
    todayStart: periodStart("hoy", nowMs)!,
    total,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      folio: row.folio,
      customerName: row.customer_name,
      deliveryType: row.delivery_type,
      status: row.status,
      totalCents: toCents(row.total),
      shippingPending: row.shipping_cost === null,
      createdAt: row.created_at,
    })),
  };
}

export type AdminOrderDetail = {
  id: string;
  folio: string;
  status: OrderStatus;
  deliveryType: DeliveryType;
  createdAt: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  address: string | null;
  neighborhood: string | null;
  addressReferences: string | null;
  paymentMethod: string;
  cashAmountCents: number | null;
  customerNotes: string | null;
  subtotalCents: number;
  shippingCents: number | null;
  totalCents: number;
  items: { id: string; name: string; presentation: string | null; quantity: number; unitPriceCents: number; subtotalCents: number }[];
  history: { id: string; previousStatus: OrderStatus | null; newStatus: OrderStatus; changedBy: string | null; createdAt: string }[];
};

/** Pedido con partidas (SNAPSHOT de order_items) e historial; null si no existe o no es visible. */
export async function getAdminOrder(id: string): Promise<AdminOrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, folio, status, delivery_type, created_at, customer_name, customer_phone, address, neighborhood, address_references,
       payment_method, cash_amount, customer_notes, subtotal, shipping_cost, total,
       branch:branches!inner ( name ),
       order_items ( id, product_name, product_presentation, quantity, unit_price, subtotal, created_at ),
       order_status_history ( id, previous_status, new_status, changed_by, created_at )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) queryError("el pedido", error.code);
  if (!data) return null;

  return {
    id: data.id,
    folio: data.folio,
    status: data.status,
    deliveryType: data.delivery_type,
    createdAt: data.created_at,
    branchName: data.branch.name,
    customerName: data.customer_name,
    customerPhone: data.customer_phone,
    address: data.address,
    neighborhood: data.neighborhood,
    addressReferences: data.address_references,
    paymentMethod: data.payment_method,
    cashAmountCents: data.cash_amount === null ? null : toCents(data.cash_amount),
    customerNotes: data.customer_notes,
    subtotalCents: toCents(data.subtotal),
    shippingCents: data.shipping_cost === null ? null : toCents(data.shipping_cost),
    totalCents: toCents(data.total),
    items: [...data.order_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.product_name.localeCompare(b.product_name, "es"))
      .map((item) => ({
        id: item.id,
        name: item.product_name,
        presentation: item.product_presentation,
        quantity: Number(item.quantity),
        unitPriceCents: toCents(item.unit_price),
        subtotalCents: toCents(item.subtotal),
      })),
    history: [...data.order_status_history]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((entry) => ({
        id: entry.id,
        previousStatus: entry.previous_status,
        newStatus: entry.new_status,
        changedBy: entry.changed_by,
        createdAt: entry.created_at,
      })),
  };
}
