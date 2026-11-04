"use client";

import { useCallback, useRef, useState } from "react";

import { createLiveSearch, type LiveSearch, type LiveSearchItem } from "@/lib/catalog/live-search";

// El índice se pide UNA vez por visita (al enfocar o escribir por primera vez) y
// lo comparten todas las instancias del buscador (móvil y desktop). No hay
// consultas de red por tecla: Fuse busca localmente.
let indexRequest: Promise<LiveSearch> | null = null;

function requestIndex(): Promise<LiveSearch> {
  indexRequest ??= fetch("/api/busqueda")
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { items } = (await response.json()) as { items: LiveSearchItem[] };
      return createLiveSearch(items);
    })
    .catch((error: unknown) => {
      indexRequest = null; // se reintenta en el siguiente foco
      throw error;
    });
  return indexRequest;
}

export type LiveSearchStatus = "idle" | "loading" | "ready" | "error";

export function useLiveSearchIndex() {
  const [state, setState] = useState<{ status: LiveSearchStatus; search: LiveSearch | null }>({
    status: "idle",
    search: null,
  });

  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState({ status: "loading", search: null });
    requestIndex()
      .then((search) => setState({ status: "ready", search }))
      .catch(() => {
        // Sin índice la búsqueda completa (Enter / "Ver todos") sigue funcionando.
        started.current = false;
        setState({ status: "error", search: null });
      });
  }, []);

  return { ...state, load };
}
