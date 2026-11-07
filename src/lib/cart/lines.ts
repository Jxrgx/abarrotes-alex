import { type PricingType, type PriceRules, resolveUnitPrice } from "@/lib/catalog/pricing";

import type { CartItem, CartProductInfo, CartResolveResponse, CartState } from "./schema";

// Cruce puro entre el carrito local (ids + cantidades) y los datos actuales del
// catálogo (POST /api/carrito). Lo usan /carrito y /checkout.

export type CartResolution = {
  branchId: string | null;
  /** Ids consultados: los que no regresaron ya no están disponibles. */
  requested: Set<string>;
  data: CartResolveResponse;
  /** Número de revalidación forzada que produjo estos datos. */
  revision: number;
};

export type CartLineStatus = "loading" | "ok" | "soldOut" | "unavailable";

export type CartLine = {
  item: CartItem;
  info: CartProductInfo | undefined;
  status: CartLineStatus;
  /** Precio unitario para ESTA cantidad, en centavos (0 si no está disponible). */
  unitCents: number;
  /** Regla que fija el precio mostrado (la base vuelve a calcularlo al crear el pedido). */
  pricingType: PricingType;
};

export function priceRules(info: CartProductInfo): PriceRules {
  return { priceCents: info.priceCents, promoPriceCents: info.promoPriceCents, wholesaleTiers: info.wholesaleTiers };
}

export function resolveCartLines(cart: CartState, resolution: CartResolution) {
  const lines: CartLine[] = cart.items.map((item) => {
    const info = resolution.data.products.find((product) => product.productId === item.productId);
    let status: CartLineStatus = "ok";
    if (!resolution.requested.has(item.productId)) status = "loading";
    else if (!info) status = "unavailable";
    else if (!info.isAvailable) status = "soldOut";
    // Mismo cálculo que private.line_price (normal, promoción y mayoreo por cantidad).
    const price = info && status === "ok" ? resolveUnitPrice(priceRules(info), item.quantity) : null;
    return { item, info, status, unitCents: price?.unitCents ?? 0, pricingType: price?.pricingType ?? "normal" };
  });

  const payable = lines.filter((line) => line.status === "ok");
  return {
    lines,
    /** Solo productos disponibles, en centavos enteros. */
    subtotalCents: payable.reduce((total, line) => total + line.unitCents * line.item.quantity, 0),
    payableCount: payable.reduce((total, line) => total + line.item.quantity, 0),
    /** Hay productos agotados o no disponibles que deben quitarse antes de continuar. */
    blocked: lines.some((line) => line.status === "soldOut" || line.status === "unavailable"),
    pending: lines.some((line) => line.status === "loading"),
    branchUnavailable: resolution.data.branch === null,
  };
}
