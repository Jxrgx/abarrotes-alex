import { after } from "next/server";

import { ORDER_BODY_MAX_BYTES, readJsonBody } from "@/lib/http/json-body";
import { dispatchNewOrderPush } from "@/lib/notifications/dispatch";
import { createOrder } from "@/lib/orders/create-order";
import { checkoutRequestSchema, type OrderError, type OrderErrorCode, orderError } from "@/lib/orders/schema";

// Crea un pedido anónimo. La lógica autoritativa vive en public.create_order;
// aquí se valida el formato y se traducen los errores a códigos estables.
// Ver docs/orders.md.

const STATUS: Record<OrderErrorCode, number> = {
  CART_EMPTY: 400,
  INVALID_CART: 400,
  INVALID_QUANTITY: 400,
  INVALID_CHECKOUT_DATA: 400,
  BRANCH_UNAVAILABLE: 409,
  PRODUCT_UNAVAILABLE: 409,
  PRODUCT_OUT_OF_STOCK: 409,
  PRICE_CHANGED: 409,
  INTERNAL_ERROR: 500,
};

const NO_STORE = { "Cache-Control": "no-store" };

function errorResponse(error: OrderError) {
  return Response.json({ error }, { status: STATUS[error.code], headers: NO_STORE });
}

// Solo POST: los demás métodos responden 405 (Next.js, al no exportarlos).
export async function POST(request: Request) {
  // Tamaño y Content-Type se validan ANTES de parsear: un payload enorme no llega a Zod
  // ni a PostgreSQL. El código de dominio se conserva; el estado HTTP indica la causa.
  const read = await readJsonBody(request, ORDER_BODY_MAX_BYTES);
  if (!read.ok) {
    return Response.json({ error: orderError("INVALID_CHECKOUT_DATA") }, { status: read.status, headers: NO_STORE });
  }
  const body = read.data;

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Solo rutas de campos: nunca se devuelven ni se registran los valores enviados.
    const paths = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    if (paths.some((path) => /^items\.\d+\.quantity$/.test(path))) {
      return errorResponse(orderError("INVALID_QUANTITY"));
    }
    if (paths.some((path) => path === "items" || path.startsWith("items."))) {
      return errorResponse(orderError("INVALID_CART"));
    }
    return errorResponse(orderError("INVALID_CHECKOUT_DATA", { fields: paths }));
  }

  try {
    const result = await createOrder(parsed.data);
    if (!result.ok) return errorResponse(result.error);
    // Aviso al dueño DESPUÉS de responder: un fallo del push nunca afecta al pedido.
    // También en reintentos (replayed): la base reclama el envío como máximo una vez
    // por pedido, así que no se duplica y cubre el caso de una invocación que se cortó.
    const orderId = result.order.orderId;
    after(() => dispatchNewOrderPush(orderId));
    return Response.json(
      { order: result.order },
      { status: result.order.replayed ? 200 : 201, headers: NO_STORE },
    );
  } catch {
    console.error("[orders] error inesperado al crear pedido");
    return errorResponse(orderError("INTERNAL_ERROR"));
  }
}
