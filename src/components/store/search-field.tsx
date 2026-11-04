"use client";

import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  CATALOG_PATH,
  type CatalogFilters,
  catalogHref,
  parseCatalogParams,
  sanitizeSearch,
} from "@/lib/catalog/filters";
import { isLiveQuery, type LiveSearchItem, liveResultHref } from "@/lib/catalog/live-search";
import { cn } from "@/lib/utils";

import { LiveSearchOption } from "./live-search-option";
import { Spinner } from "./pending-hint";
import { useLiveSearchIndex } from "./use-live-search-index";

type SearchFieldProps = { id: string; className?: string };

const inputClassName =
  "h-10 w-full rounded-lg border border-input bg-background-secondary pr-3 pl-9 text-base text-foreground transition-colors duration-150 placeholder:text-subtle-foreground hover:border-subtle-foreground/40 focus:bg-background md:text-sm";

// Buscador del header (home y catálogo): búsqueda instantánea con Fuse.js
// (autocomplete, patrón combobox de WAI-ARIA) + búsqueda completa con Enter o
// "Ver todos" (/productos?q=, server-side). Desde /productos conserva categoría,
// subcategoría, marca y orden; desde otras páginas empieza una búsqueda nueva.
export function SearchField({ id, className }: SearchFieldProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const onCatalog = pathname === CATALOG_PATH;
  const current: CatalogFilters = onCatalog
    ? parseCatalogParams(Object.fromEntries(searchParams.entries()))
    : {};

  // key: al navegar, el campo refleja la búsqueda de la URL.
  return <LiveSearchField key={current.q ?? ""} id={id} className={className} current={current} />;
}

type ActiveOption = { type: "product"; item: LiveSearchItem } | { type: "all" };

function LiveSearchField({ id, className, current }: SearchFieldProps & { current: CatalogFilters }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(current.q ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { status, search, load } = useLiveSearchIndex();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = `${id}-sugerencias`;
  const optionId = (index: number) => `${id}-opcion-${index}`;
  const statusId = useId();

  const liveQuery = isLiveQuery(query);
  const results = useMemo(() => (search && liveQuery ? search(query) : []), [search, liveQuery, query]);
  // La última opción siempre es "Ver todos": lleva a la búsqueda completa.
  const options: ActiveOption[] = useMemo(
    () => [...results.map((item) => ({ type: "product" as const, item })), { type: "all" as const }],
    [results],
  );
  const expanded = open && liveQuery;

  // El resultado activo con teclado siempre queda visible dentro del panel.
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
  });

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function navigate(href: string) {
    close();
    inputRef.current?.blur(); // cierra el teclado en móvil
    startTransition(() => router.push(href));
  }

  function fullSearchHref() {
    return catalogHref({ ...current, q: sanitizeSearch(query) });
  }

  function choose(option: ActiveOption) {
    navigate(option.type === "product" ? liveResultHref(option.item, current) : fullSearchHref());
  }

  // Enter sin resultado activo: búsqueda completa (nunca elige el primero solo).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(fullSearchHref());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!liveQuery) return;
      event.preventDefault();
      load();
      if (!open) {
        setOpen(true);
        return;
      }
      const last = options.length - 1;
      setActiveIndex((index) =>
        event.key === "ArrowDown" ? (index >= last ? 0 : index + 1) : index <= 0 ? last : index - 1,
      );
    } else if (event.key === "Enter" && expanded && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === "Escape" && expanded) {
      // Cierra el panel; el foco se queda en el campo.
      event.preventDefault();
      close();
    }
  }

  // Cerrar cuando el foco sale del buscador (Tab, clic o toque fuera).
  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }

  let panel: ReactNode = null;
  if (expanded) {
    if (status === "loading" || (status === "ready" && !search)) {
      panel = <PanelMessage icon={<LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}>Buscando productos…</PanelMessage>;
    } else if (status === "ready" && results.length === 0) {
      panel = <PanelMessage>No encontramos productos para «{query.trim()}».</PanelMessage>;
    }
  }

  const showListbox = expanded && (status === "ready" || status === "error");
  const announcement = !expanded
    ? ""
    : status === "ready"
      ? results.length === 0
        ? `No encontramos productos para ${query.trim()}.`
        : `${results.length} ${results.length === 1 ? "resultado" : "resultados"}. Usa las flechas para elegir.`
      : "";

  return (
    <form
      role="search"
      action={CATALOG_PATH}
      method="get"
      onSubmit={handleSubmit}
      onBlur={handleBlur}
      aria-busy={isPending}
      className={cn("relative", className)}
    >
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <SearchIcon pending={isPending} />
      <input
        ref={inputRef}
        id={id}
        name="q"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showListbox}
        aria-controls={showListbox ? listboxId : undefined}
        aria-activedescendant={showListbox && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={statusId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
          load();
        }}
        onFocus={() => {
          load();
          if (isLiveQuery(query)) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Buscar productos..."
        enterKeyHint="search"
        autoComplete="off"
        maxLength={60}
        className={inputClassName}
      />
      <p id={statusId} className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {expanded && (panel || showListbox) && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-overlay">
          {panel}
          {showListbox && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Sugerencias de productos"
              className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain py-1"
            >
              {results.map((item, index) => (
                <LiveSearchOption
                  key={item.id}
                  id={optionId(index)}
                  item={item}
                  active={index === activeIndex}
                  onHover={() => setActiveIndex(index)}
                  onChoose={() => choose({ type: "product", item })}
                />
              ))}
              {/* Búsqueda completa: siempre disponible, también si la búsqueda instantánea falló. */}
              <li
                id={optionId(results.length)}
                role="option"
                aria-selected={activeIndex === results.length}
                // mousedown sin perder el foco del campo; la navegación ocurre en click (mouse y touch).
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose({ type: "all" })}
                onMouseMove={() => setActiveIndex(results.length)}
                className={cn(
                  "mx-1 flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium text-primary",
                  results.length > 0 && "mt-1",
                  activeIndex === results.length ? "bg-primary-soft text-primary-dark" : "hover:bg-background-secondary",
                )}
              >
                <span className="min-w-0 truncate">Ver todos los resultados para «{query.trim()}»</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </li>
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

function PanelMessage({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 text-sm text-muted-foreground">
      {icon}
      {children}
    </p>
  );
}

function SearchIcon({ pending }: { pending: boolean }) {
  return pending ? (
    <Spinner className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
  ) : (
    <Search
      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
      aria-hidden="true"
    />
  );
}

// Versión sin hooks para el shell estático (Suspense). Sin JavaScript también
// funciona: el formulario hace un GET normal a /productos?q=...
export function SearchForm({ id, className }: SearchFieldProps) {
  return (
    <form role="search" action={CATALOG_PATH} method="get" className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <SearchIcon pending={false} />
      <input
        id={id}
        name="q"
        type="search"
        placeholder="Buscar productos..."
        enterKeyHint="search"
        autoComplete="off"
        maxLength={60}
        className={inputClassName}
      />
    </form>
  );
}
