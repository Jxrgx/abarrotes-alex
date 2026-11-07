"use client";

import { useSyncExternalStore } from "react";

// "El catálogo está cargando un resultado nuevo": lo publican el buscador del header y la
// paginación (cada uno con su propio useTransition) y lo lee la zona de resultados para
// atenuar el grid anterior mientras llega el nuevo (sin skeleton en cada tecla).

const sources = new Set<string>();
const listeners = new Set<() => void>();

export function setCatalogNavigationPending(source: string, pending: boolean) {
  const had = sources.has(source);
  if (pending === had) return;
  if (pending) sources.add(source);
  else sources.delete(source);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCatalogNavigationPending() {
  return useSyncExternalStore(
    subscribe,
    () => sources.size > 0,
    () => false,
  );
}
