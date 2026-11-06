import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { OrderReceipt } from "./schema";
import { buildOrderWhatsAppMessage, buildWhatsAppUrl } from "./whatsapp";

const receipt: OrderReceipt = {
  orderId: "3f0c1a6e-0000-4000-8000-000000000001",
  folio: "ALEX-000124",
  status: "new",
  createdAt: "2026-11-03T10:00:00Z",
  deliveryType: "delivery",
  paymentMethod: "cash",
  subtotalCents: 11800,
  shippingCents: null,
  totalCents: 11800,
  replayed: false,
  branch: { name: "Abarrotes Alex - Sucursal Principal", whatsappNumber: "525500000000" },
  items: [
    // Promoción: el importe viene del comprobante (2 × $15.00), no del precio normal.
    { productId: "p-1", name: "Refresco de cola", presentation: "600 ml", unitPriceCents: 1500, quantity: 2, subtotalCents: 3000 },
    { productId: "p-2", name: "Galletas de chocolate", presentation: "250 g", unitPriceCents: 2400, quantity: 1, subtotalCents: 2400 },
    { productId: "p-3", name: "Leche entera", presentation: "1 L", unitPriceCents: 3200, quantity: 2, subtotalCents: 6400 },
  ],
};

const contact = {
  name: "José Peña",
  address: "Av. Niños Héroes 12, int. 3",
  neighborhood: "Centro",
  references: "Portón café, junto a la tienda",
  cashAmountCents: 20000,
  notes: "Si no hay Coca-Cola normal, puede ser sin azúcar.\nGracias 😊",
};

describe("buildOrderWhatsAppMessage", () => {
  const message = buildOrderWhatsAppMessage(receipt, contact);

  test("incluye el folio y es una consulta (el pedido ya está registrado)", () => {
    assert.match(message, /^Hola, tengo una consulta sobre mi pedido ALEX-000124\.$/m);
    assert.doesNotMatch(message, /quiero realizar/);
  });

  test("lista múltiples productos con importes del comprobante (incluida la promoción)", () => {
    assert.match(message, /^2 × Refresco de cola 600 ml — \$30\.00$/m);
    assert.match(message, /^1 × Galletas de chocolate 250 g — \$24\.00$/m);
    assert.match(message, /^2 × Leche entera 1 L — \$64\.00$/m);
  });

  test("subtotal, envío por confirmar y total parcial", () => {
    assert.match(message, /^Subtotal: \$118\.00$/m);
    assert.match(message, /^Envío: Por confirmar$/m);
    assert.match(message, /^Total parcial: \$118\.00$/m);
  });

  test("entrega a domicilio con dirección, colonia y referencias", () => {
    assert.match(message, /^Entrega a domicilio$/m);
    assert.match(message, /^Nombre: José Peña$/m);
    assert.match(message, /^Dirección: Av\. Niños Héroes 12, int\. 3$/m);
    assert.match(message, /^Colonia: Centro$/m);
    assert.match(message, /^Referencias: Portón café, junto a la tienda$/m);
  });

  test("efectivo con la cantidad con la que pagará", () => {
    assert.match(message, /^\*PAGO\*\nEfectivo\nPagaré con: \$200\.00$/m);
  });

  test("comentarios conservan saltos de línea", () => {
    assert.ok(message.endsWith("*COMENTARIOS*\nSi no hay Coca-Cola normal, puede ser sin azúcar.\nGracias 😊"));
  });

  test("no incluye datos técnicos", () => {
    assert.doesNotMatch(message, /3f0c1a6e|p-1|p-2|status|new\b|cash\b/);
  });

  test("recoger en sucursal: sin domicilio, con la sucursal", () => {
    const pickup = buildOrderWhatsAppMessage(
      { ...receipt, deliveryType: "pickup" },
      { name: "Ana", address: "No debe salir", notes: "" },
    );
    assert.match(pickup, /^Recoger en sucursal: Abarrotes Alex - Sucursal Principal$/m);
    assert.doesNotMatch(pickup, /Dirección|No debe salir|COMENTARIOS|Pagaré con/);
  });

  test("recoger mínimo (solo nombre): sin teléfono, dirección, «Pagaré con» ni comentarios", () => {
    const pickup = buildOrderWhatsAppMessage({ ...receipt, deliveryType: "pickup" }, { name: "Ana" });
    assert.match(pickup, /ALEX-000124/);
    assert.match(pickup, /^Recoger en sucursal: Abarrotes Alex - Sucursal Principal$/m);
    assert.match(pickup, /^Nombre: Ana$/m);
    assert.match(pickup, /^\*PAGO\*\nEfectivo al recoger$/m);
    assert.match(pickup, /Subtotal: \$/);
    assert.doesNotMatch(pickup, /Teléfono|Dirección|Colonia|Referencias|Pagaré con|COMENTARIOS|undefined|null/);
  });

  test("recoger: aunque el contacto traiga efectivo o notas, no se incluyen", () => {
    const pickup = buildOrderWhatsAppMessage({ ...receipt, deliveryType: "pickup" }, { name: "Ana", cashAmountCents: 50000, notes: "Nota" });
    assert.doesNotMatch(pickup, /Pagaré con|COMENTARIOS|Nota/);
  });

  test("un salto de línea en la dirección no rompe el formato", () => {
    const text = buildOrderWhatsAppMessage(receipt, { ...contact, address: "Calle 1\r\nCasa azul" });
    assert.match(text, /^Dirección: Calle 1 Casa azul$/m);
  });

  test("si el envío ya se conoce, muestra Total", () => {
    const text = buildOrderWhatsAppMessage({ ...receipt, shippingCents: 3000, totalCents: 14800 }, contact);
    assert.match(text, /^Envío: \$30\.00$/m);
    assert.match(text, /^Total: \$148\.00$/m);
  });
});

describe("buildWhatsAppUrl", () => {
  test("codifica acentos, ñ, saltos de línea, $ y emojis; el número queda solo con dígitos", () => {
    const message = buildOrderWhatsAppMessage(receipt, contact);
    const url = buildWhatsAppUrl("+52 55 0000-0000", message);
    assert.ok(url);
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, "https://wa.me/525500000000");
    assert.equal(parsed.searchParams.get("text"), message);
    assert.match(url, /%0A/); // salto de línea
    assert.match(url, /%24118\.00/); // $118.00
    assert.match(url, /Pe%C3%B1a/); // ñ
    assert.doesNotMatch(url.split("?text=")[1], /[\s$ñé\n&#]/); // nada sin codificar
  });

  test("caracteres que romperían la URL (&, #, ?, +) se codifican", () => {
    const url = buildWhatsAppUrl("525500000000", "A & B #1 ¿ok? 2+2");
    assert.equal(url, "https://wa.me/525500000000?text=A%20%26%20B%20%231%20%C2%BFok%3F%202%2B2");
  });

  test("sin número válido no hay enlace", () => {
    assert.equal(buildWhatsAppUrl(null, "hola"), null);
    assert.equal(buildWhatsAppUrl("123", "hola"), null);
    assert.equal(buildWhatsAppUrl("0525500000000", "hola"), null);
  });
});
