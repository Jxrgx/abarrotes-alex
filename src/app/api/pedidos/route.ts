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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(orderError("INVALID_CHECKOUT_DATA"));
  }

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
    return Response.json(
      { order: result.order },
      { status: result.order.replayed ? 200 : 201, headers: NO_STORE },
    );
  } catch {
    console.error("[orders] error inesperado al crear pedido");
    return errorResponse(orderError("INTERNAL_ERROR"));
  }
}
