import { z } from "zod";

// Formato persistido en localStorage (ver docs/cart.md). Solo ids y cantidades:
// nombre, precio y promoción SIEMPRE se obtienen del catálogo actual.

export const CART_STORAGE_KEY = "abarrotes-alex:cart";
export const CART_VERSION = 1;
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 99;
/** Productos distintos como máximo (protege el storage y la consulta por lote). */
export const MAX_CART_ITEMS = 100;

export type CartItem = { productId: string; quantity: number };

export type CartState = {
  version: typeof CART_VERSION;
  /** Sucursal a la que pertenece el carrito. null mientras está vacío y sin uso. */
  branchId: string | null;
  items: CartItem[];
};

export function emptyCart(branchId: string | null = null): CartState {
  return { version: CART_VERSION, branchId, items: [] };
}

// Cantidad válida: entero entre 1 y 99. Valores mayores se recortan a 99; cero,
// negativos o no numéricos no son válidos (null).
export function normalizeQuantity(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const quantity = Math.trunc(value);
  if (quantity < MIN_QUANTITY) return null;
  return Math.min(quantity, MAX_QUANTITY);
}

const storedCartSchema = z.object({
  version: z.literal(CART_VERSION),
  branchId: z.uuid().nullable(),
  items: z.array(z.unknown()).max(MAX_CART_ITEMS * 5),
});

const storedItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number(),
});

// Nunca lanza: JSON corrupto o versión desconocida -> carrito vacío.
// Elementos inválidos se descartan uno por uno, cantidades fuera de rango se
// normalizan y los productos repetidos se ignoran (gana el primero).
export function parseStoredCart(raw: string | null): CartState {
  if (!raw) return emptyCart();

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return emptyCart();
  }

  const parsed = storedCartSchema.safeParse(json);
  if (!parsed.success) return emptyCart();

  const items: CartItem[] = [];
  const seen = new Set<string>();
  for (const candidate of parsed.data.items) {
    const item = storedItemSchema.safeParse(candidate);
    if (!item.success) continue;
    const productId = item.data.productId.toLowerCase();
    const quantity = normalizeQuantity(item.data.quantity);
    if (quantity === null || seen.has(productId)) continue;
    seen.add(productId);
    items.push({ productId, quantity });
    if (items.length === MAX_CART_ITEMS) break;
  }

  return { version: CART_VERSION, branchId: parsed.data.branchId?.toLowerCase() ?? null, items };
}

// Petición al endpoint de resolución (/api/carrito).
export const cartResolveRequestSchema = z.object({
  branchId: z.uuid(),
  productIds: z.array(z.uuid()).min(1).max(MAX_CART_ITEMS),
});

export type CartResolveRequest = z.infer<typeof cartResolveRequestSchema>;

/** Información pública y actual de un producto del carrito (montos en centavos). */
export type CartProductInfo = {
  productId: string;
  name: string;
  brandName: string | null;
  presentation: string | null;
  priceUnit: string | null;
  imagePath: string | null;
  isAvailable: boolean;
  priceCents: number;
  promoPriceCents: number | null;
};

export type CartResolveResponse = {
  /** null si la sucursal del carrito ya no está activa. */
  branch: { id: string; name: string } | null;
  /** Solo productos visibles en esa sucursal; los ausentes ya no están disponibles. */
  products: CartProductInfo[];
};
