// Precios compartidos por catálogo y carrito. Módulo puro (servidor y cliente).

// PostgREST serializa `numeric` como número JSON (p. ej. 24.5). Para sumar y
// multiplicar sin errores de punto flotante se trabaja en centavos enteros.
export function toCents(value: number) {
  return Math.round(value * 100);
}

// Precio que ve el cliente: el promocional si hay una oferta visible (RLS ya
// filtra vigencia), si no el precio normal de la sucursal.
export function effectivePrice<T extends number>(product: { price: T; promoPrice: T | null }) {
  return product.promoPrice ?? product.price;
}
