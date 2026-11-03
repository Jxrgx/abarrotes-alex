"use client";

import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type ReactNode, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  type CatalogFacet,
  type CatalogFilters,
  catalogHref,
  brandsInScope,
  type FilterBrand,
  type FilterCategory,
  type FilterSubcategory,
  SORT_OPTIONS,
  type SortOrder,
  subcategoriesInScope,
} from "@/lib/catalog/filters";
import { cn } from "@/lib/utils";

import { Spinner } from "./pending-hint";

type CatalogFiltersProps = {
  /** Filtros ya validados en el servidor. */
  filters: CatalogFilters;
  categories: FilterCategory[];
  subcategories: FilterSubcategory[];
  brands: FilterBrand[];
  facets: CatalogFacet[];
};

// Islas de cliente mínimas: los resultados se siguen obteniendo en el servidor;
// aquí solo se construye la URL y se navega.
function useCatalogNavigation() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(next: CatalogFilters) {
    startTransition(() => router.push(catalogHref(next), { scroll: false }));
  }

  return { navigate, isPending };
}

export function DesktopFilterControls(props: CatalogFiltersProps) {
  const { navigate, isPending } = useCatalogNavigation();
  return <DesktopControls {...props} navigate={navigate} isPending={isPending} />;
}

export function MobileFilterButton(props: CatalogFiltersProps) {
  const { navigate, isPending } = useCatalogNavigation();
  return <MobileFilters {...props} navigate={navigate} isPending={isPending} />;
}

type ControlProps = CatalogFiltersProps & { navigate: (next: CatalogFilters) => void };

function scopeIds(
  props: CatalogFiltersProps,
  categoria: string | undefined,
  subcategoria: string | undefined,
) {
  const category = props.categories.find((item) => item.slug === categoria);
  const subcategory = category
    ? props.subcategories.find((item) => item.categoryId === category.id && item.slug === subcategoria)
    : undefined;
  return { category, subcategory };
}

// ---------------------------------------------------------------------------
// Desktop: marca y orden aplican al cambiar (la categoría/subcategoría son chips).
// ---------------------------------------------------------------------------

function DesktopControls({ navigate, isPending, ...props }: ControlProps & { isPending: boolean }) {
  const { filters } = props;
  const { category, subcategory } = scopeIds(props, filters.categoria, filters.subcategoria);
  const brandOptions = brandsInScope(props, {
    categoryId: category?.id,
    subcategoryId: subcategory?.id,
    selectedSlug: filters.marca,
  });

  return (
    <div className="hidden items-center gap-3 md:flex" aria-busy={isPending}>
      {isPending && <Spinner />}
      <FilterSelect
        id="filtro-marca"
        label="Marca"
        value={filters.marca ?? ""}
        onChange={(event) => navigate({ ...filters, marca: event.target.value || undefined })}
      >
        <option value="">Todas las marcas</option>
        {brandOptions.map((brand) => (
          <option key={brand.id} value={brand.slug}>
            {brand.name}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect
        id="filtro-orden"
        label="Ordenar por"
        value={filters.orden ?? ""}
        onChange={(event) =>
          navigate({ ...filters, orden: (event.target.value || undefined) as SortOrder | undefined })
        }
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </FilterSelect>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Móvil: botón "Filtros" + bottom sheet (<dialog> nativo: foco atrapado, Esc
// cierra y el foco vuelve al botón). Los cambios se aplican con "Ver resultados".
// ---------------------------------------------------------------------------

function MobileFilters({ navigate, isPending, ...props }: ControlProps & { isPending: boolean }) {
  const { filters } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<CatalogFilters>(filters);
  const activeCount = [filters.categoria, filters.subcategoria, filters.marca].filter(Boolean).length;

  const { category, subcategory } = scopeIds(props, draft.categoria, draft.subcategoria);
  const subcategoryOptions = subcategoriesInScope(props.subcategories, props.facets, category?.id);
  const brandOptions = brandsInScope(props, {
    categoryId: category?.id,
    subcategoryId: subcategory?.id,
    selectedSlug: draft.marca,
  });

  function open() {
    setDraft(filters);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function apply() {
    navigate({ ...draft, q: filters.q });
    close();
  }

  return (
    <div className="md:hidden">
      <Button variant="secondary" onClick={open} aria-haspopup="dialog" aria-busy={isPending}>
        {isPending ? <Spinner /> : <SlidersHorizontal aria-hidden="true" />}
        Filtros
        {activeCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
            {activeCount}
            <span className="sr-only"> activos</span>
          </span>
        )}
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="filtros-titulo"
        className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none flex-col rounded-t-xl border-0 bg-background p-0 text-foreground shadow-overlay backdrop:bg-foreground/40 open:flex open:animate-in open:fade-in-0 open:slide-in-from-bottom-8 open:duration-200"
        onClick={(event) => {
          // Clic en el fondo oscuro (fuera del contenido) cierra el panel.
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 id="filtros-titulo" className="text-lg font-semibold">
            Filtros
          </h2>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Cerrar filtros">
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <FilterSelect
            id="sheet-categoria"
            label="Categoría"
            stacked
            value={draft.categoria ?? ""}
            // Cambiar de categoría descarta la subcategoría (pertenece a la anterior).
            onChange={(event) =>
              setDraft({ ...draft, categoria: event.target.value || undefined, subcategoria: undefined })
            }
          >
            <option value="">Todas las categorías</option>
            {props.categories.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="sheet-subcategoria"
            label="Subcategoría"
            stacked
            value={draft.subcategoria ?? ""}
            disabled={!category}
            hint={category ? undefined : "Elige primero una categoría."}
            onChange={(event) => setDraft({ ...draft, subcategoria: event.target.value || undefined })}
          >
            <option value="">{category ? `Todo ${category.name}` : "Todas"}</option>
            {subcategoryOptions.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="sheet-marca"
            label="Marca"
            stacked
            value={draft.marca ?? ""}
            onChange={(event) => setDraft({ ...draft, marca: event.target.value || undefined })}
          >
            <option value="">Todas las marcas</option>
            {brandOptions.map((brand) => (
              <option key={brand.id} value={brand.slug}>
                {brand.name}
              </option>
            ))}
          </FilterSelect>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Ordenar por</legend>
            <div className="space-y-2">
              {SORT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm transition-colors duration-150 has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-dark"
                >
                  <input
                    type="radio"
                    name="sheet-orden"
                    value={option.value}
                    checked={(draft.orden ?? "") === option.value}
                    onChange={() =>
                      setDraft({ ...draft, orden: (option.value || undefined) as SortOrder | undefined })
                    }
                    className="size-4 accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setDraft({ q: filters.q })}
          >
            Limpiar
          </Button>
          <Button className="flex-1" onClick={apply}>
            Ver resultados
          </Button>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FilterSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  hint,
  stacked = false,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  hint?: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-ayuda` : undefined;
  return (
    <div className={cn(stacked ? "space-y-1.5" : "flex items-center gap-2")}>
      <label
        htmlFor={id}
        className={cn("text-sm", stacked ? "block font-medium" : "whitespace-nowrap text-muted-foreground")}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-describedby={hintId}
          className={cn(
            "h-10 w-full appearance-none rounded-lg border border-input bg-background pr-9 pl-3 text-base text-foreground transition-colors duration-150 hover:bg-background-secondary md:text-sm",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle-foreground",
            !stacked && "min-w-44",
          )}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-subtle-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
