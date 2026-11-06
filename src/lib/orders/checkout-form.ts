import { z } from "zod";

import { formatCents } from "@/lib/format";

import type { checkoutRequestSchema } from "./schema";

// Reglas del formulario de checkout (cliente). Son una comodidad de UX: el
// servidor (Zod en /api/pedidos) y public.create_order vuelven a validar todo.

export const NOTES_MAX_LENGTH = 500;
const MAX_CASH_CENTS = 9_999_999;

// Teléfono de México: 10 dígitos. Acepta espacios, guiones, paréntesis y el
// prefijo +52 (o 521 de celulares antiguos), y devuelve solo los 10 dígitos.
export function normalizeMxPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) return digits.slice(3);
  return null;
}

// "$500", "500", "1,250.50", "1 250" -> centavos enteros sin punto flotante.
// Devuelve null si no es una cantidad válida con hasta 2 decimales.
export function parseMoneyToCents(input: string): number | null {
  const clean = input.trim().replace(/^\$\s*/, "").replace(/[,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

const required = (message: string) => z.string().trim().min(1, message);

// Campos que solo existen a domicilio. Con "Recoger en sucursal" no se muestran, no se
// validan y NUNCA se envían (aunque React Hook Form conserve lo escrito por si el
// cliente vuelve a domicilio).
export const DELIVERY_ONLY_FIELDS = ["address", "neighborhood", "references", "cashAmount", "notes"] as const;

// El efectivo depende del subtotal actual, por eso el esquema se crea con él.
// Siempre: nombre y teléfono obligatorios. Domicilio: además dirección y colonia;
// referencias, efectivo y notas opcionales. Recoger: solo nombre y teléfono.
export function makeCheckoutFormSchema(subtotalCents: number) {
  return z
    .object({
      name: required("Escribe tu nombre.")
        .min(2, "Escribe tu nombre (al menos 2 letras).")
        .max(120, "Usa máximo 120 caracteres."),
      phone: required("Escribe tu teléfono.").refine((value) => normalizeMxPhone(value) !== null, {
        message: "Escribe un teléfono de 10 dígitos.",
      }),
      deliveryType: z.enum(["delivery", "pickup"]),
      address: z.string(),
      neighborhood: z.string(),
      references: z.string(),
      cashAmount: z.string(),
      notes: z.string(),
    })
    .superRefine((values, context) => {
      if (values.deliveryType !== "delivery") return;

      if (values.notes.length > NOTES_MAX_LENGTH)
        context.addIssue({ code: "custom", path: ["notes"], message: `Usa máximo ${NOTES_MAX_LENGTH} caracteres.` });

      const address = values.address.trim();
      const neighborhood = values.neighborhood.trim();
      if (!address) context.addIssue({ code: "custom", path: ["address"], message: "Escribe tu dirección." });
      else if (address.length > 300)
        context.addIssue({ code: "custom", path: ["address"], message: "Usa máximo 300 caracteres." });
      if (!neighborhood) context.addIssue({ code: "custom", path: ["neighborhood"], message: "Escribe tu colonia." });
      else if (neighborhood.length > 120)
        context.addIssue({ code: "custom", path: ["neighborhood"], message: "Usa máximo 120 caracteres." });
      if (values.references.trim().length > 300)
        context.addIssue({ code: "custom", path: ["references"], message: "Usa máximo 300 caracteres." });

      if (values.cashAmount.trim()) {
        const cents = parseMoneyToCents(values.cashAmount);
        if (cents === null || cents <= 0 || cents > MAX_CASH_CENTS) {
          context.addIssue({ code: "custom", path: ["cashAmount"], message: "Escribe una cantidad válida, por ejemplo 500." });
        } else if (cents < subtotalCents) {
          context.addIssue({
            code: "custom",
            path: ["cashAmount"],
            message: `Debe ser al menos el total parcial (${formatCents(subtotalCents)}).`,
          });
        }
      }
    });
}

export type CheckoutFormValues = z.input<ReturnType<typeof makeCheckoutFormSchema>>;

export const EMPTY_CHECKOUT_FORM: CheckoutFormValues = {
  name: "",
  phone: "",
  deliveryType: "delivery",
  address: "",
  neighborhood: "",
  references: "",
  cashAmount: "",
  notes: "",
};

export type CheckoutRequestBody = z.input<typeof checkoutRequestSchema>;

// Arma el cuerpo de POST /api/pedidos. Solo ids y cantidades del carrito; el
// subtotal mostrado viaja como expectedSubtotalCents (comparación, no autoridad).
// Con "recoger en sucursal" no se envía ningún dato de domicilio.
export function buildCheckoutRequest(
  values: CheckoutFormValues,
  context: {
    clientRequestId: string;
    branchId: string;
    items: { productId: string; quantity: number }[];
    expectedSubtotalCents: number;
  },
): CheckoutRequestBody {
  const base = {
    clientRequestId: context.clientRequestId,
    branchId: context.branchId,
    items: context.items.map(({ productId, quantity }) => ({ productId, quantity })),
    expectedSubtotalCents: context.expectedSubtotalCents,
  };

  const customer = { name: values.name.trim(), phone: normalizeMxPhone(values.phone) ?? values.phone };

  // Recoger: nombre y teléfono. Pago en efectivo al recoger (sin "con cuánto"), sin notas.
  if (values.deliveryType === "pickup") {
    return {
      ...base,
      customer,
      delivery: { type: "pickup" },
      payment: { method: "cash" },
    };
  }

  const cashAmountCents = values.cashAmount.trim() ? parseMoneyToCents(values.cashAmount) : null;
  const notes = values.notes.trim();
  return {
    ...base,
    customer,
    delivery: {
      type: "delivery",
      address: values.address.trim(),
      neighborhood: values.neighborhood.trim(),
      references: values.references.trim() || undefined,
    },
    payment: { method: "cash", cashAmountCents: cashAmountCents ?? undefined },
    notes: notes || undefined,
  };
}

// Huella del contenido que define un intento de pedido: sucursal + productos +
// cantidades. Si cambia, el checkout usa un clientRequestId nuevo.
export function cartFingerprint(branchId: string, items: { productId: string; quantity: number }[]) {
  const lines = items.map((item) => `${item.productId}:${item.quantity}`).sort();
  return `${branchId}|${lines.join(",")}`;
}

// Rutas de error del servidor -> campos del formulario.
export const SERVER_FIELD_TO_FORM: Record<string, keyof CheckoutFormValues> = {
  "customer.name": "name",
  "customer.phone": "phone",
  "delivery.type": "deliveryType",
  "delivery.address": "address",
  "delivery.neighborhood": "neighborhood",
  "delivery.references": "references",
  "payment.cashAmountCents": "cashAmount",
  notes: "notes",
};
