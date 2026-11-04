import { decimalToCents } from "@/lib/catalog/pricing";
import type { OrderStatus } from "@/lib/orders/status";
import type { Database } from "@/types/database";

// Forma tipada del dashboard (montos en centavos). Módulo puro: se prueba sin red.

export type DashboardRecentOrder = {
  id: string;
  folio: string;
  customerName: string;
  deliveryType: Database["public"]["Enums"]["delivery_type"];
  totalCents: number;
  /** true = envío por confirmar: el total es parcial. */
  shippingPending: boolean;
  status: OrderStatus;
  createdAt: string;
};

export type DashboardTopProduct = {
  productId: string;
  name: string;
  presentation: string | null;
  quantity: number;
  orders: number;
};

export type DashboardData = {
  /** Inicio de "hoy" en la zona del negocio, calculado por la base. */
  todayStart: string;
  ordersToday: number;
  cancelledToday: number;
  /** Suma de totales conocidos de hoy, sin cancelados. */
  amountTodayCents: number;
  /** amountToday / pedidos no cancelados de hoy. */
  averageTicketCents: number;
  /** Pedidos en estados pendientes (cualquier fecha). */
  pending: number;
  recent: DashboardRecentOrder[];
  topProducts: DashboardTopProduct[];
};

type RawDashboard = {
  today_start: string;
  today: { orders: number; cancelled: number; amount: string; average_ticket: string };
  pending: number;
  recent: {
    id: string;
    folio: string;
    customer_name: string;
    delivery_type: DashboardRecentOrder["deliveryType"];
    total: string;
    shipping_pending: boolean;
    status: OrderStatus;
    created_at: string;
  }[];
  top_products: {
    product_id: string;
    name: string;
    presentation: string | null;
    quantity: number;
    orders: number;
  }[];
};

export function toDashboardData(raw: RawDashboard): DashboardData {
  return {
    todayStart: raw.today_start,
    ordersToday: raw.today.orders,
    cancelledToday: raw.today.cancelled,
    amountTodayCents: decimalToCents(raw.today.amount),
    averageTicketCents: decimalToCents(raw.today.average_ticket),
    pending: raw.pending,
    recent: raw.recent.map((order) => ({
      id: order.id,
      folio: order.folio,
      customerName: order.customer_name,
      deliveryType: order.delivery_type,
      totalCents: decimalToCents(order.total),
      shippingPending: order.shipping_pending,
      status: order.status,
      createdAt: order.created_at,
    })),
    topProducts: raw.top_products.map((product) => ({
      productId: product.product_id,
      name: product.name,
      presentation: product.presentation,
      quantity: Number(product.quantity),
      orders: product.orders,
    })),
  };
}

export type { RawDashboard };
