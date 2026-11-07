"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect, useTransition } from "react";

import { type CatalogFilters, catalogHref } from "@/lib/catalog/filters";
import { setCatalogNavigationPending } from "@/lib/catalog/navigation-pending";
import { paginationItems } from "@/lib/catalog/pagination";
import { cn } from "@/lib/utils";

/** Id de la sección de resultados: destino del scroll al cambiar de página. */
export const CATALOG_RESULTS_ID = "lista-productos";

const control =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors duration-150";

// Paginación del catálogo. Enlaces reales (<a href>: funcionan sin JS, con clic central y
// "abrir en otra pestaña"); con JS la navegación va en una transición (el grid anterior se
// queda atenuado) y lleva al inicio de la lista, no al inicio de la página.
// Desktop: ← Anterior 1 … 7 8 9 … 42 Siguiente →. Móvil: ← Anterior · Página 8 de 42 · Siguiente →.
export function CatalogPagination({
  filters,
  page,
  totalPages,
}: {
  filters: CatalogFilters;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCatalogNavigationPending("paginacion", isPending);
    return () => setCatalogNavigationPending("paginacion", false);
  }, [isPending]);

  if (totalPages <= 1) return null;

  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return; // nueva pestaña/ventana: comportamiento normal del navegador
    }
    event.preventDefault();
    const list = document.getElementById(CATALOG_RESULTS_ID);
    if (list && list.getBoundingClientRect().top < 0) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
    startTransition(() => router.push(href, { scroll: false }));
  }

  const link = (target: number, children: ReactNode, extra?: { label?: string; className?: string }) => {
    const href = catalogHref(filters, target);
    return (
      <a
        href={href}
        onClick={(event) => navigate(event, href)}
        aria-label={extra?.label}
        aria-current={target === page ? "page" : undefined}
        className={cn(control, extra?.className)}
      >
        {children}
      </a>
    );
  };

  const disabled = (children: ReactNode) => (
    <button type="button" disabled className={cn(control, "border text-subtle-foreground opacity-50")}>
      {children}
    </button>
  );

  const previous =
    page > 1
      ? link(page - 1, <><ChevronLeft className="size-4" aria-hidden="true" />Anterior</>, { label: "Página anterior", className: "border bg-background hover:bg-accent" })
      : disabled(<><ChevronLeft className="size-4" aria-hidden="true" />Anterior</>);
  const next =
    page < totalPages
      ? link(page + 1, <>Siguiente<ChevronRight className="size-4" aria-hidden="true" /></>, { label: "Página siguiente", className: "border bg-background hover:bg-accent" })
      : disabled(<>Siguiente<ChevronRight className="size-4" aria-hidden="true" /></>);

  return (
    <nav aria-label="Paginación de productos" aria-busy={isPending} className="mt-8 flex items-center justify-between gap-3">
      {previous}

      {/* Móvil: solo el contexto, sin números pequeños */}
      <p className="text-sm text-muted-foreground tabular-nums md:hidden">
        Página {page} de {totalPages}
      </p>

      {/* Desktop: ventana de páginas con elipsis */}
      <ul className="hidden items-center gap-1 md:flex">
        {paginationItems(page, totalPages).map((item) =>
          item.type === "ellipsis" ? (
            <li key={item.key} aria-hidden="true" className="px-1 text-subtle-foreground">
              …
            </li>
          ) : (
            <li key={item.page}>
              {link(item.page, item.page, {
                label: `Página ${item.page}`,
                className:
                  item.page === page
                    ? "bg-primary text-primary-foreground tabular-nums"
                    : "text-foreground tabular-nums hover:bg-accent",
              })}
            </li>
          ),
        )}
      </ul>

      {next}
    </nav>
  );
}
