import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { getPublicSupabase } from "@/lib/supabase/public";

import {
  type CheckoutRequest,
  type CreateOrderResult,
  ORDER_ERROR_CODES,
  type OrderErrorCode,
  type OrderReceipt,
  orderError,
} from "./schema";

// Frontera de confianza: del request solo se usan ids, cantidades y datos del
// cliente. Precios, promociones, subtotales, total y folio los calcula
// public.create_order en PostgreSQL, en una sola transacción.
export async function createOrder(input: CheckoutRequest): Promise<CreateOrderResult> {
  // Errores evidentes antes de ir a la base (la función los vuelve a validar).
  if (input.items.length === 0) return { ok: false, error: orderError("CART_EMPTY") };
  if (new Set(input.items.map((item) => item.productId.toLowerCase())).size !== input.items.length) {
    return { ok: false, error: orderError("INVALID_CART") };
  }

  const delivery = input.delivery;
  // create_order no depende de la identidad del usuario: siempre se invoca como
  // anon (cliente público, sin cookies). Su seguridad está en la propia función.
  const supabase = getPublicSupabase();
  const { data, error } = await supabase.rpc("create_order", {
    p_client_request_id: input.clientRequestId,
    p_branch_id: input.branchId,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    p_customer_name: input.customer.name,
    p_customer_phone: input.customer.phone,
    p_delivery_type: delivery.type,
    p_payment_method: input.payment.method,
    p_address: delivery.type === "delivery" ? delivery.address : undefined,
    p_neighborhood: delivery.type === "delivery" ? delivery.neighborhood : undefined,
    p_address_references: delivery.type === "delivery" ? delivery.references : undefined,
    p_cash_amount: centsToNumeric(input.payment.cashAmountCents),
    p_customer_notes: input.notes,
    p_expected_subtotal: centsToNumeric(input.expectedSubtotalCents),
  });

  if (error) return { ok: false, error: mapDatabaseError(error) };
  return { ok: true, order: toReceipt(data as DbReceipt) };
}

// Centavos enteros -> número con 2 decimales exactos en JSON (1999 -> 19.99).
function centsToNumeric(cents: number | undefined) {
  return cents === undefined ? undefined : cents / 100;
}

// "1512.50" -> 151250 sin pasar por punto flotante.
export function decimalToCents(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Monto inválido");
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

// Columnas de create_order -> rutas del request (para marcar campos en el formulario).
const FIELD_PATHS: Record<string, string> = {
  client_request_id: "clientRequestId",
  customer_name: "customer.name",
  customer_phone: "customer.phone",
  delivery_type: "delivery.type",
  address: "delivery.address",
  neighborhood: "delivery.neighborhood",
  address_references: "delivery.references",
  payment_method: "payment.method",
  cash_amount: "payment.cashAmountCents",
  customer_notes: "notes",
};

function mapDatabaseError(error: PostgrestError) {
  // Errores de negocio: SQLSTATE P0001 con el código en el mensaje y contexto JSON en details.
  if (error.code === "P0001" && (ORDER_ERROR_CODES as readonly string[]).includes(error.message)) {
    const code = error.message as OrderErrorCode;
    let detail: { product_ids?: string[]; field?: string; subtotal?: string } = {};
    try {
      detail = JSON.parse(error.details || "{}");
    } catch {
      // Sin contexto adicional.
    }
    return orderError(code, {
      productIds: detail.product_ids,
      fields: detail.field ? [FIELD_PATHS[detail.field] ?? detail.field] : undefined,
      subtotalCents: detail.subtotal ? decimalToCents(detail.subtotal) : undefined,
    });
  }
  // Valor de enum inválido u otro dato mal formado.
  if (error.code === "22P02") return orderError("INVALID_CHECKOUT_DATA");

  // Nunca se registra el request: puede contener nombre, teléfono y dirección.
  console.error(`[orders] create_order falló: ${error.code}`);
  return orderError("INTERNAL_ERROR");
}

type DbReceipt = {
  order_id: string;
  folio: string;
  status: string;
  created_at: string;
  delivery_type: "delivery" | "pickup";
  payment_method: string;
  subtotal: string;
  shipping_cost: string | null;
  total: string;
  replayed: boolean;
  branch: { name: string; whatsapp_number: string | null };
  items: {
    product_id: string;
    name: string;
    presentation: string | null;
    unit_price: string;
    quantity: number;
    subtotal: string;
  }[];
};

function toReceipt(receipt: DbReceipt): OrderReceipt {
  return {
    orderId: receipt.order_id,
    folio: receipt.folio,
    status: receipt.status,
    createdAt: receipt.created_at,
    deliveryType: receipt.delivery_type,
    paymentMethod: receipt.payment_method,
    subtotalCents: decimalToCents(receipt.subtotal),
    shippingCents: receipt.shipping_cost === null ? null : decimalToCents(receipt.shipping_cost),
    totalCents: decimalToCents(receipt.total),
    replayed: receipt.replayed,
    branch: { name: receipt.branch.name, whatsappNumber: receipt.branch.whatsapp_number },
    items: receipt.items.map((item) => ({
      productId: item.product_id,
      name: item.name,
      presentation: item.presentation,
      unitPriceCents: decimalToCents(item.unit_price),
      quantity: item.quantity,
      subtotalCents: decimalToCents(item.subtotal),
    })),
  };
}
