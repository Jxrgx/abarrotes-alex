"use client";

import { useEffect, useState } from "react";

import type { CartResolution } from "@/lib/cart/lines";
import type { CartResolveResponse, CartState } from "@/lib/cart/schema";

// Resolución por lote de datos actuales del carrito (POST /api/carrito).
// Solo consulta si hay productos sin resolver, si cambió la sucursal o si se
// pidió una revalidación (refresh). Cambiar cantidades no genera consultas.
export function useCartResolution(cart: CartState | null) {
  const [resolution, setResolution] = useState<CartResolution | null>(null);
  const [failure, setFailure] = useState<{ key: string; attempt: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);

  const ids = cart?.items.map((item) => item.productId) ?? [];
  const branchId = cart?.branchId ?? null;
  const needsFetch =
    branchId !== null &&
    ids.length > 0 &&
    (!resolution ||
      resolution.branchId !== branchId ||
      resolution.revision !== revision ||
      ids.some((id) => !resolution.requested.has(id)));
  const fetchKey = needsFetch ? `${branchId}|${revision}|${[...ids].sort().join(",")}` : null;

  useEffect(() => {
    if (!fetchKey) return;
    const controller = new AbortController();
    const [branchId, revisionText, idList] = fetchKey.split("|");
    const productIds = idList.split(",");

    fetch("/api/carrito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, productIds }),
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as CartResolveResponse;
        setResolution({ branchId, requested: new Set(productIds), data, revision: Number(revisionText) });
      })
      .catch(() => {
        // El carrito local no se toca: solo falla la consulta de datos actuales.
        if (!controller.signal.aborted) setFailure({ key: fetchKey, attempt });
      });

    return () => controller.abort();
  }, [fetchKey, attempt]);

  const failed = fetchKey !== null && failure?.key === fetchKey && failure.attempt === attempt;
  return {
    resolution,
    loading: fetchKey !== null && !failed,
    failed,
    retry: () => setAttempt((value) => value + 1),
    /** Vuelve a consultar precios y disponibilidad actuales (p. ej. tras PRICE_CHANGED). */
    refresh: () => setRevision((value) => value + 1),
  };
}
