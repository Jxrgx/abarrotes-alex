"use client";

import type { ReactNode } from "react";

import { useCatalogNavigationPending } from "@/lib/catalog/navigation-pending";
import { cn } from "@/lib/utils";

import { CATALOG_RESULTS_ID } from "./catalog-pagination";
import { Spinner } from "./pending-hint";

// Zona de resultados: mientras llega la búsqueda/página nueva, el grid anterior se queda
// visible y atenuado con un aviso discreto (sin skeleton en cada tecla, sin saltos).
export function CatalogResults({ children }: { children: ReactNode }) {
  const pending = useCatalogNavigationPending();
  return (
    <section
      id={CATALOG_RESULTS_ID}
      aria-labelledby="lista-productos-titulo"
      aria-busy={pending}
      className="relative scroll-mt-36 md:scroll-mt-24"
    >
      <h2 id="lista-productos-titulo" className="sr-only">
        Lista de productos
      </h2>
      {pending && (
        <p className="pointer-events-none absolute inset-x-0 -top-3 z-10 flex justify-center" aria-hidden="true">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground shadow-card">
            <Spinner />
            Actualizando…
          </span>
        </p>
      )}
      <div className={cn("transition-opacity duration-150", pending && "opacity-60")}>{children}</div>
    </section>
  );
}
