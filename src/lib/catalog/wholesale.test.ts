import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { tierRangeLabel, tierSavings } from "@/lib/admin/wholesale-forms";
import { parseWholesaleTiers as parseFormTiers } from "@/lib/admin/wholesale-forms";
import { resolveCartLines } from "@/lib/cart/lines";
import { parseStoredCart } from "@/lib/cart/schema";

import { type PriceRules, resolveUnitPrice, wholesaleCardText, wholesaleCartText, wholesaleHint } from "./pricing";
import { parseWholesaleTiers } from "./products";

// Espejo TypeScript de private.line_price (la paridad con SQL se prueba en
// tests/integration/wholesale.test.mjs) y textos de orientación de mayoreo.

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const tiers = (...list: [number, number | null, number][]) =>
  list.map(([minQuantity, maxQuantity, unitPriceCents]) => ({ minQuantity, maxQuantity, unitPriceCents }));
const rules = (priceCents: number, promoPriceCents: number | null, wholesaleTiers = tiers()): PriceRules => ({ priceCents, promoPriceCents, wholesaleTiers });
const price = (r: PriceRules, quantity: number) => {
  const resolved = resolveUnitPrice(r, quantity);
  return [resolved.unitCents, resolved.pricingType];
};

describe("resolveUnitPrice", () => {
  test("sin promoción ni mayoreo", () => {
    const r = rules(2200, null);
    assert.deepEqual(price(r, 1), [2200, "normal"]);
    assert.deepEqual(price(r, 2), [2200, "normal"]);
  });

  test("escalones 3–5 $20 · 6–11 $18.50 · 12+ $17", () => {
    const r = rules(2200, null, tiers([3, 5, 2000], [6, 11, 1850], [12, null, 1700]));
    const table: [number, number][] = [[2, 2200], [3, 2000], [5, 2000], [6, 1850], [11, 1850], [12, 1700], [99, 1700]];
    for (const [quantity, cents] of table) assert.equal(resolveUnitPrice(r, quantity).unitCents, cents, `qty ${quantity}`);
  });

  test("solo 3–5: la 6 vuelve al normal", () => {
    assert.deepEqual(price(rules(2200, null, tiers([3, 5, 2000])), 6), [2200, "normal"]);
  });

  test("promoción + mayoreo: siempre el mejor precio, nunca sube por alcanzar mayoreo", () => {
    const r = rules(2200, 1900, tiers([3, 5, 2000], [6, null, 1800]));
    assert.deepEqual(price(r, 1), [1900, "promotion"]);
    assert.deepEqual(price(r, 3), [1900, "promotion"]);
    assert.deepEqual(price(r, 6), [1800, "wholesale"]);
  });

  test("empate promoción = mayoreo → promotion (determinista)", () => {
    assert.deepEqual(price(rules(2200, 2000, tiers([3, null, 2000])), 3), [2000, "promotion"]);
  });

  test("defensivo: niveles o promociones no menores al normal se ignoran", () => {
    assert.deepEqual(price(rules(1900, null, tiers([3, null, 2000])), 5), [1900, "normal"]);
    assert.deepEqual(price(rules(1900, 1900), 1), [1900, "normal"]);
  });

  test("aplica a TODA la partida: 3 × $20 = $60, no 2 × $22 + 1 × $20", () => {
    const r = rules(2200, null, tiers([3, null, 2000]));
    assert.equal(resolveUnitPrice(r, 2).unitCents * 2, 4400);
    assert.equal(resolveUnitPrice(r, 3).unitCents * 3, 6000);
  });
});

describe("textos de mayoreo (tarjeta y carrito)", () => {
  const r = rules(2200, null, tiers([3, 5, 2000], [6, null, 1800]));
  const card = (quantity: number) => wholesaleCardText(wholesaleHint(r, quantity)!, quantity, money);
  const cart = (quantity: number) => wholesaleCartText(wholesaleHint(r, quantity)!, money);

  test("stepper 1 → 2 → 3 → 2 → 6 → 12", () => {
    assert.equal(card(0), "Mayoreo desde 3 pzas · $20.00 c/u", "fuera del carrito");
    assert.equal(card(1), "Mayoreo desde 3 pzas · $20.00 c/u");
    assert.equal(card(2), "Mayoreo: agrega 1 más y paga $20.00 c/u");
    assert.equal(card(3), "Mayoreo aplicado · $20.00 c/u");
    assert.equal(card(4), "Mayoreo: agrega 2 más y paga $18.00 c/u", "siguiente nivel");
    assert.equal(card(2), "Mayoreo: agrega 1 más y paga $20.00 c/u", "al bajar vuelve a orientar");
    assert.equal(card(6), "Mayoreo aplicado · $18.00 c/u");
    assert.equal(card(12), "Mayoreo aplicado · $18.00 c/u");
  });

  test("subtotales del carrito en la misma secuencia", () => {
    const sequence: [number, number][] = [[1, 2200], [2, 4400], [3, 6000], [2, 4400], [6, 10800], [12, 21600]];
    for (const [quantity, subtotal] of sequence) {
      const resolved = resolveCartLines(
        { version: 1, branchId: "b", items: [{ productId: "p", quantity }] },
        {
          branchId: "b",
          requested: new Set(["p"]),
          revision: 0,
          data: {
            branch: { id: "b", name: "Sucursal" },
            products: [{ productId: "p", name: "Globito", brandName: null, presentation: "220 g", priceUnit: null, imagePath: null, isAvailable: true, priceCents: 2200, promoPriceCents: null, wholesaleTiers: r.wholesaleTiers as never }],
          },
        },
      );
      assert.equal(resolved.subtotalCents, subtotal, `qty ${quantity}`);
      assert.equal(resolved.lines[0].pricingType, quantity >= 3 ? "wholesale" : "normal");
    }
  });

  test("carrito: «Agrega N más para obtener…» y nada si no hay siguiente nivel", () => {
    assert.equal(cart(1), "Agrega 2 más para obtener $20.00 c/u");
    assert.equal(cart(2), "Agrega 1 más para obtener $20.00 c/u");
    assert.equal(cart(4), "Agrega 2 más para obtener $18.00 c/u");
    assert.equal(cart(6), null);
  });

  test("promoción mejor que el primer nivel: se anuncia el nivel que sí mejora", () => {
    const withPromo = rules(2200, 1900, tiers([3, 5, 2000], [6, null, 1800]));
    assert.equal(wholesaleCardText(wholesaleHint(withPromo, 0)!, 0, money), "Mayoreo desde 6 pzas · $18.00 c/u");
    assert.equal(wholesaleCardText(wholesaleHint(withPromo, 3)!, 3, money), "Mayoreo: agrega 3 más y paga $18.00 c/u");
    assert.equal(wholesaleHint(rules(2200, 1500, tiers([3, null, 1800])), 1), null, "la oferta gana a todo el mayoreo: sin aviso");
  });

  test("rango acotado sin más niveles y huecos", () => {
    const bounded = rules(2200, null, tiers([3, 5, 2000]));
    assert.equal(wholesaleCardText(wholesaleHint(bounded, 0)!, 0, money), "Mayoreo de 3 a 5 pzas · $20.00 c/u");
    assert.equal(wholesaleCardText(wholesaleHint(bounded, 7)!, 7, money), "Mayoreo de 3 a 5 pzas · $20.00 c/u");
    const gap = rules(2200, null, tiers([3, 5, 2000], [10, null, 1700]));
    assert.equal(wholesaleCardText(wholesaleHint(gap, 7)!, 7, money), "Mayoreo: agrega 3 más y paga $17.00 c/u");
  });
});

describe("datos", () => {
  test("parseWholesaleTiers (vista): centavos, orden y elementos malformados", () => {
    assert.deepEqual(
      parseWholesaleTiers([{ min: 6, max: null, price: 18.5 }, { min: 3, max: 5, price: 20 }, { min: "x" }, null, 4]),
      tiers([3, 5, 2000], [6, null, 1850]),
    );
    assert.deepEqual(parseWholesaleTiers(null), []);
  });

  test("el carrito persistido guarda solo ids y cantidades (los precios se descartan)", () => {
    const stored = parseStoredCart(
      JSON.stringify({ version: 1, branchId: null, items: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 3, unitPrice: 1, pricingType: "wholesale" }] }),
    );
    assert.deepEqual(stored.items, [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 3 }]);
  });
});

describe("formulario de mayoreo (panel)", () => {
  const B = "00000000-0000-4000-8000-000000000001";
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.append(key, value);
    return data;
  };
  const parse = (entries: Record<string, string>, normal = "22.00") => {
    const errors: Record<string, string> = {};
    const result = parseFormTiers(form(entries), B, normal, errors);
    return { result, errors };
  };
  const tier = (i: number, min: string, max: string | null, priceText: string) => ({
    [`wholesale:${B}:${i}:min`]: min,
    ...(max === null ? { [`wholesale:${B}:${i}:unlimited`]: "on" } : { [`wholesale:${B}:${i}:max`]: max }),
    [`wholesale:${B}:${i}:price`]: priceText,
  });

  test("uno, varios y sin límite", () => {
    const { result, errors } = parse({ ...tier(0, "3", "5", "20"), ...tier(1, "6", "11", "$18.5"), ...tier(2, "12", null, "17.00") });
    assert.deepEqual(errors, {});
    assert.deepEqual(result, [
      { id: null, minQuantity: 3, maxQuantity: 5, unitPrice: "20.00" },
      { id: null, minQuantity: 6, maxQuantity: 11, unitPrice: "18.50" },
      { id: null, minQuantity: 12, maxQuantity: null, unitPrice: "17.00" },
    ]);
  });

  test("mensajes amigables: precio ≥ normal, cruce, final < inicial, precio creciente, mínimo 2", () => {
    assert.equal(parse(tier(0, "3", null, "22.00")).errors[`wholesale:${B}:0:price`], "El precio por mayoreo debe ser menor que el precio normal.");
    assert.equal(parse({ ...tier(0, "3", "6", "20"), ...tier(1, "5", "10", "19") }).errors[`wholesale:${B}`], "Este rango se cruza con otro precio por mayoreo.");
    assert.equal(parse(tier(0, "5", "3", "20")).errors[`wholesale:${B}:0:max`], "La cantidad final debe ser igual o mayor que la inicial.");
    assert.equal(
      parse({ ...tier(0, "3", "5", "18"), ...tier(1, "6", null, "20") }).errors[`wholesale:${B}`],
      "Un nivel para una cantidad mayor no puede tener un precio superior al nivel anterior.",
    );
    assert.match(parse(tier(0, "1", null, "20")).errors[`wholesale:${B}:0:min`], /entre 2 y 99/);
    assert.match(parse(tier(0, "3", null, "0")).errors[`wholesale:${B}:0:price`], /mayor a 0/);
    assert.deepEqual(parse({ ...tier(0, "3", "5", "20"), ...tier(1, "10", null, "17") }).errors, {}, "huecos permitidos");
  });

  test("nivel existente sin cambio de precio por encima del nuevo normal: no se bloquea (requiere revisión)", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const unchanged = { ...tier(0, "3", null, "20.00"), [`wholesale:${B}:0:id`]: id, [`wholesale:${B}:0:original`]: "20.00" };
    assert.deepEqual(parse(unchanged, "19.00").errors, {});
    assert.equal(parse({ ...unchanged, [`wholesale:${B}:0:price`]: "19.50" }, "19.00").errors[`wholesale:${B}:0:price`], "El precio por mayoreo debe ser menor que el precio normal.");
  });

  test("ahorro y etiqueta de rango", () => {
    assert.deepEqual(tierSavings(2000, 2200), { savingsCents: 200, percent: "9.1 %" });
    assert.equal(tierSavings(2200, 2200), null);
    assert.equal(tierRangeLabel(3, 5), "3–5 pzas");
    assert.equal(tierRangeLabel(12, null), "12+ pzas");
  });
});
