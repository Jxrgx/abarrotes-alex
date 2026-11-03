import { X } from "lucide-react";
import Link from "next/link";

import type { FilterSubcategory } from "@/lib/catalog/filters";
import { cn } from "@/lib/utils";

import { PendingHint } from "./pending-hint";

const pillBase =
  "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150";

// Subcategorías de la categoría elegida (solo las que tienen productos).
export function SubcategoryNav({
  categoryName,
  subcategories,
  activeSlug,
  getHref,
}: {
  categoryName: string;
  subcategories: FilterSubcategory[];
  activeSlug: string | undefined;
  getHref: (slug: string | null) => string;
}) {
  if (subcategories.length === 0) return null;

  const items = [{ slug: null, name: `Todo ${categoryName}` }, ...subcategories];
  return (
    <nav aria-label={`Subcategorías de ${categoryName}`}>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        {items.map((item) => {
          const active = (activeSlug ?? null) === item.slug;
          return (
            <li key={item.slug ?? "todas"} className="shrink-0">
              <Link
                href={getHref(item.slug)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  pillBase,
                  active
                    ? "border-primary bg-primary-soft text-primary-dark"
                    : "bg-background text-muted-foreground hover:border-input hover:text-foreground",
                )}
              >
                {item.name}
                <PendingHint />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export type ActiveFilterChip = {
  key: string;
  label: string;
  /** Nombre accesible, p. ej. "Quitar filtro Bebidas". */
  removeLabel: string;
  href: string;
};

// Filtros aplicados: cada chip quita solo su filtro y conserva los demás.
export function ActiveFilters({ chips, clearHref }: { chips: ActiveFilterChip[]; clearHref: string }) {
  if (chips.length === 0) return null;

  return (
    <div className="min-w-0">
      <h2 className="sr-only">Filtros activos</h2>
      {/* Móvil: una fila deslizable; desktop: se acomodan en varias líneas. */}
      <ul className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        {chips.map((chip) => (
          <li key={chip.key} className="shrink-0">
            <Link
              href={chip.href}
              scroll={false}
              aria-label={chip.removeLabel}
              className={cn(
                pillBase,
                "bg-background-secondary pr-3 text-foreground hover:border-input hover:bg-accent",
              )}
            >
              {chip.label}
              <PendingHint>
                <X className="size-4 text-muted-foreground" aria-hidden="true" />
              </PendingHint>
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Link
            href={clearHref}
            scroll={false}
            className="inline-flex h-10 items-center rounded-lg px-2 text-sm font-medium whitespace-nowrap text-primary underline-offset-4 hover:text-primary-hover hover:underline"
          >
            Limpiar filtros
            <PendingHint className="ml-1.5" />
          </Link>
        </li>
      </ul>
    </div>
  );
}
