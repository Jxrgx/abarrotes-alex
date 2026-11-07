import { z } from "zod";

import type { PricingType } from "@/lib/catalog/pricing";

// Contrato de creación de pedidos (POST /api/pedidos). Módulo puro: el checkout
// (Fase 6B) puede reutilizar este esquema en el formulario, pero la validación
// que cuenta es la del servidor y, al final, la de public.create_order.
// Ver docs/orders.md.

export const ORDER_ERROR_CODES = [
  "CART_EMPTY",
  "INVALID_CART",
  "INVALID_QUANTITY",
  "BRANCH_UNAVAILABLE",
  "PRODUCT_UNAVAILABLE",
  "PRODUCT_OUT_OF_STOCK",
  "PRICE_CHANGED",
  "INVALID_CHECKOUT_DATA",
  "INTERNAL_ERROR",
] as const;

export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

export const ORDER_ERROR_MESSAGES: Record<OrderErrorCode, string> = {
  CART_EMPTY: "Tu carrito está vacío.",
  INVALID_CART: "Tu carrito tiene información inválida. Revísalo e inténtalo de nuevo.",
  INVALID_QUANTITY: "Algunas cantidades no son válidas (de 1 a 99 por producto).",
  BRANCH_UNAVAILABLE: "La sucursal no está disponible en este momento.",
  PRODUCT_UNAVAILABLE: "Algunos productos ya no están disponibles. Quítalos de tu carrito para continuar.",
  PRODUCT_OUT_OF_STOCK: "Algunos productos están agotados. Quítalos de tu carrito para continuar.",
  PRICE_CHANGED: "Los precios de tu carrito cambiaron. Revisa el nuevo total antes de confirmar.",
  INVALID_CHECKOUT_DATA: "Revisa los datos marcados.",
  INTERNAL_ERROR: "No pudimos crear tu pedido. Inténtalo de nuevo en unos momentos.",
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const checkoutRequestSchema = z.object({
  /** UUID nuevo por intento de pedido (idempotencia ante doble clic o reintentos). */
  clientRequestId: z.uuid(),
  branchId: z.uuid(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .max(100),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().transform(onlyDigits).pipe(z.string().regex(/^\d{10,15}$/)),
  }),
  delivery: z.discriminatedUnion("type", [
    z.object({ type: z.literal("pickup") }),
    z.object({
      type: z.literal("delivery"),
      address: z.string().trim().min(1).max(300),
      neighborhood: z.string().trim().min(1).max(120),
      references: optionalText(300),
    }),
  ]),
  payment: z.object({
    method: z.literal("cash"),
    /** Con cuánto paga el cliente, en centavos. Opcional. */
    cashAmountCents: z.number().int().positive().max(9_999_999).optional(),
  }),
  notes: optionalText(500),
  /** Subtotal que vio el cliente, en centavos. Solo para detectar PRICE_CHANGED. */
  expectedSubtotalCents: z.number().int().nonnegative().optional(),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export type OrderReceipt = {
  orderId: string;
  folio: string;
  status: string;
  createdAt: string;
  deliveryType: "delivery" | "pickup";
  paymentMethod: string;
  subtotalCents: number;
  /** null = envío por confirmar. */
  shippingCents: number | null;
  totalCents: number;
  /** true si este intento ya se había creado antes (mismo clientRequestId). */
  replayed: boolean;
  branch: { name: string; whatsappNumber: string | null };
  items: {
    productId: string;
    name: string;
    presentation: string | null;
    unitPriceCents: number;
    quantity: number;
    subtotalCents: number;
    /** Regla con la que se cobró (snapshot de la base). Ausente en comprobantes antiguos. */
    pricingType?: PricingType | null;
  }[];
};

export type OrderError = {
  code: OrderErrorCode;
  message: string;
  /** Productos afectados (no disponibles, agotados o con cantidad inválida). */
  productIds?: string[];
  /** Campos inválidos con la ruta del request, p. ej. "customer.phone". */
  fields?: string[];
  /** Subtotal recalculado en el servidor cuando el código es PRICE_CHANGED. */
  subtotalCents?: number;
};

export type CreateOrderResult = { ok: true; order: OrderReceipt } | { ok: false; error: OrderError };

export function orderError(code: OrderErrorCode, extra: Omit<OrderError, "code" | "message"> = {}): OrderError {
  return { code, message: ORDER_ERROR_MESSAGES[code], ...extra };
}
