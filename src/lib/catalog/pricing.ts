// Precios compartidos por catálogo y carrito. Módulo puro (servidor y cliente).
//
// AUTORIDAD: el precio que se cobra lo decide PostgreSQL (private.line_price, usado por
// create_order). resolveUnitPrice es su espejo para PRESENTACIÓN (tarjeta, carrito,
// checkout) y las pruebas de PGlite comparan ambos con la misma matriz de casos
// (tests/integration/wholesale.test.mjs). Ver docs/wholesale.md.

// PostgREST serializa `numeric` como número JSON (p. ej. 24.5). Para sumar y
// multiplicar sin errores de punto flotante se trabaja en centavos enteros.
export function toCents(value: number) {
  return Math.round(value * 100);
}

// "1512.50" (numeric serializado como texto) -> 151250 sin pasar por punto flotante.
export function decimalToCents(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Monto inválido");
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

/** Regla que fija el precio de una partida (mismo enum que order_items.pricing_type). */
export type PricingType = "normal" | "promotion" | "wholesale";

/** Nivel de mayoreo: precio unitario para cantidades en [minQuantity, maxQuantity]. */
export type WholesaleTier = {
  minQuantity: number;
  /** null = sin límite superior ("12+"). */
  maxQuantity: number | null;
  unitPriceCents: number;
};

export type PriceRules = {
  priceCents: number;
  /** Promoción vigente (la vista ya la filtra); null si no hay. */
  promoPriceCents: number | null;
  /** Niveles aplicables de la vista (ordenados o no). Vacío si no hay mayoreo. */
  wholesaleTiers: readonly WholesaleTier[];
};

export type ResolvedPrice = { unitCents: number; pricingType: PricingType; tier: WholesaleTier | null };

// Precio para UNA unidad (lo que muestra y ordena el catálogo): min(normal, promoción).
export function effectivePrice<T extends number>(product: { price: T; promoPrice: T | null }) {
  return product.promoPrice ?? product.price;
}

/**
 * Mejor precio unitario para `quantity` unidades: min(normal, promoción, mayoreo del
 * rango que contiene la cantidad). El precio del nivel aplica a TODA la partida.
 * Empate promoción = mayoreo → promoción. Mismo resultado que private.line_price.
 */
export function resolveUnitPrice(rules: PriceRules, quantity: number): ResolvedPrice {
  const promo = rules.promoPriceCents !== null && rules.promoPriceCents < rules.priceCents ? rules.promoPriceCents : null;
  const base = promo ?? rules.priceCents;
  const tier =
    rules.wholesaleTiers.find(
      (item) =>
        item.unitPriceCents < rules.priceCents &&
        quantity >= item.minQuantity &&
        (item.maxQuantity === null || quantity <= item.maxQuantity),
    ) ?? null;
  if (tier && tier.unitPriceCents < base) return { unitCents: tier.unitPriceCents, pricingType: "wholesale", tier };
  return { unitCents: base, pricingType: promo === null ? "normal" : "promotion", tier: null };
}

export type WholesaleHint = {
  /** Precio que aplica a la cantidad actual. */
  current: ResolvedPrice;
  /** Siguiente nivel que MEJORA el precio actual, o null. */
  next: WholesaleTier | null;
  /** Unidades que faltan para `next` (0 si no hay). */
  missing: number;
  /** Primer nivel que mejora el precio de 1 unidad (para "Mayoreo desde…"). */
  first: WholesaleTier;
  /** El mayoreo continúa más allá del primer nivel (o este no tiene límite). */
  openEnded: boolean;
};

/**
 * Información de mayoreo para orientar al cliente, o null si ningún nivel mejora el
 * precio de una unidad (p. ej. una oferta más baja que todo el mayoreo). Solo
 * informativa: nunca decide lo que se cobra.
 */
export function wholesaleHint(rules: PriceRules, quantity: number): WholesaleHint | null {
  const single = resolveUnitPrice(rules, 1).unitCents;
  const useful = [...rules.wholesaleTiers]
    .filter((tier) => tier.unitPriceCents < single)
    .sort((a, b) => a.minQuantity - b.minQuantity);
  if (useful.length === 0) return null;
  const current = resolveUnitPrice(rules, quantity);
  const next = useful.find((tier) => tier.minQuantity > quantity && tier.unitPriceCents < current.unitCents) ?? null;
  const first = useful[0];
  return {
    current,
    next,
    missing: next ? next.minQuantity - quantity : 0,
    first,
    openEnded: first.maxQuantity === null || useful.length > 1,
  };
}

/** Texto de la tarjeta de producto (una línea). `quantity` = cantidad en el carrito (0 si no está). */
export function wholesaleCardText(hint: WholesaleHint, quantity: number, money: (cents: number) => string) {
  const { current, next, first } = hint;
  if (current.pricingType === "wholesale" && current.tier) {
    // Recién alcanzado (o sin siguiente nivel): se confirma; si ya avanzó dentro del
    // nivel y hay uno mejor, se orienta hacia él.
    if (next && quantity > current.tier.minQuantity) return `Mayoreo: agrega ${hint.missing} más y paga ${money(next.unitPriceCents)} c/u`;
    return `Mayoreo aplicado · ${money(current.unitCents)} c/u`;
  }
  if (quantity >= 2 && next) return `Mayoreo: agrega ${hint.missing} más y paga ${money(next.unitPriceCents)} c/u`;
  const range = hint.openEnded ? `desde ${first.minQuantity} pzas` : `de ${first.minQuantity} a ${first.maxQuantity} pzas`;
  return `Mayoreo ${range} · ${money(first.unitPriceCents)} c/u`;
}

/** Texto de apoyo en carrito y checkout, o null. */
export function wholesaleCartText(hint: WholesaleHint, money: (cents: number) => string) {
  return hint.next ? `Agrega ${hint.missing} más para obtener ${money(hint.next.unitPriceCents)} c/u` : null;
}
