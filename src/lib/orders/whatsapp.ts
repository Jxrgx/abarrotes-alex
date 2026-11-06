import { formatCents } from "@/lib/format";

import type { OrderReceipt } from "./schema";

// Único lugar donde se construye el mensaje y el enlace de WhatsApp de un pedido.
// Los importes salen del comprobante devuelto por create_order (no del carrito,
// que ya se vació). Sin datos técnicos: ni UUIDs, ni ids de producto, ni status.

/** Datos que el cliente escribió en el checkout y que viajan solo en el mensaje. */
export type OrderContact = {
  name: string;
  address?: string;
  neighborhood?: string;
  references?: string;
  cashAmountCents?: number;
  notes?: string;
};

// Una línea por valor: evita que un salto de línea del usuario rompa el formato.
function singleLine(value: string) {
  return value.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

export function buildOrderWhatsAppMessage(receipt: OrderReceipt, contact: OrderContact) {
  const shippingKnown = receipt.shippingCents !== null;
  const lines: string[] = [
    `Hola, quiero realizar el pedido ${receipt.folio}.`,
    "",
    "*PEDIDO*",
    ...receipt.items.map((item) => {
      const name = [item.name, item.presentation].filter(Boolean).join(" ");
      return `${item.quantity} × ${name} — ${formatCents(item.subtotalCents)}`;
    }),
    "",
    `Subtotal: ${formatCents(receipt.subtotalCents)}`,
    `Envío: ${shippingKnown ? formatCents(receipt.shippingCents!) : "Por confirmar"}`,
    `${shippingKnown ? "Total" : "Total parcial"}: ${formatCents(receipt.totalCents)}`,
    "",
    "*ENTREGA*",
  ];

  if (receipt.deliveryType === "delivery") {
    lines.push("Entrega a domicilio");
    lines.push(`Nombre: ${singleLine(contact.name)}`);
    if (contact.address) lines.push(`Dirección: ${singleLine(contact.address)}`);
    if (contact.neighborhood) lines.push(`Colonia: ${singleLine(contact.neighborhood)}`);
    if (contact.references) lines.push(`Referencias: ${singleLine(contact.references)}`);
  } else {
    lines.push(`Recoger en sucursal: ${receipt.branch.name}`);
    lines.push(`Nombre: ${singleLine(contact.name)}`);
  }

  // Recoger: se paga en efectivo al recoger; no se pregunta con cuánto ni hay comentarios.
  const delivering = receipt.deliveryType === "delivery";
  lines.push("", "*PAGO*", delivering ? "Efectivo" : "Efectivo al recoger");
  if (delivering && contact.cashAmountCents) lines.push(`Pagaré con: ${formatCents(contact.cashAmountCents)}`);

  const notes = delivering ? contact.notes?.trim() : undefined;
  if (notes) {
    // Los comentarios conservan sus saltos de línea (normalizados).
    lines.push("", "*COMENTARIOS*", notes.replace(/\r\n?/g, "\n"));
  }

  return lines.join("\n");
}

// https://wa.me/<número en formato internacional, solo dígitos>?text=<mensaje codificado>
// Devuelve null si el número no es válido (sin número no hay enlace).
export function buildWhatsAppUrl(phone: string | null, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
