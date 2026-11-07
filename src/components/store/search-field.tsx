"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";

import { CATALOG_PATH, catalogHref, parseCatalogParams, sanitizeSearch } from "@/lib/catalog/filters";
import { setCatalogNavigationPending } from "@/lib/catalog/navigation-pending";
import { cn } from "@/lib/utils";

import { Spinner } from "./pending-hint";

type SearchFieldProps = { id: string; className?: string };

/** Pausa al escribir antes de actualizar la URL (y consultar el servidor). */
export const SEARCH_DEBOUNCE_MS = 250;
/** Desde fuera del catálogo se navega a /productos a partir de 2 caracteres útiles. */
const MIN_CHARS_OUTSIDE_CATALOG = 2;

const inputClassName =
  "h-10 w-full rounded-lg border border-input bg-background-secondary pr-3 pl-9 text-base text-foreground transition-colors duration-150 placeholder:text-subtle-foreground hover:border-subtle-foreground/40 focus:bg-background md:text-sm";

const usefulLength = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "").length;

// Buscador del header: un input normal que FILTRA EL GRID de /productos (sin dropdown ni
// overlays). Al escribir, tras una pausa corta, actualiza la URL (?q=, página 1) y el
// servidor responde con la página filtrada; mientras tanto el grid anterior se queda,
// atenuado. Desde otras páginas lleva a /productos?q=. La URL es la fuente de verdad
// (refresh, atrás/adelante, compartir). El input nunca se remonta: conserva foco y teclado.
export function SearchField({ id, className }: SearchFieldProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onCatalog = pathname === CATALOG_PATH;
  const urlQ = onCatalog ? (sanitizeSearch(searchParams.get("q") ?? undefined) ?? "") : "";

  const [query, setQuery] = useState(urlQ);
  // Último q de la URL ya reflejado y último q que envió ESTE campo.
  const [syncedQ, setSyncedQ] = useState(urlQ);
  const [sentQ, setSentQ] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL → input (atrás/adelante, chips, "Limpiar", el otro buscador). Si el cambio lo
  // provocó este campo, no se pisa lo que el usuario siguió escribiendo.
  if (urlQ !== syncedQ) {
    setSyncedQ(urlQ);
    if (urlQ === sentQ) setSentQ(null);
    else setQuery(urlQ);
  }

  useEffect(() => {
    setCatalogNavigationPending(id, isPending);
    return () => setCatalogNavigationPending(id, false);
  }, [id, isPending]);

  function go(clean: string) {
    setSentQ(clean);
    const current = onCatalog ? parseCatalogParams(Object.fromEntries(searchParams.entries())) : {};
    // catalogHref sin página: una búsqueda nueva siempre empieza en la página 1.
    const href = catalogHref({ ...current, q: clean || undefined });
    startTransition(() => {
      // En el catálogo: la primera búsqueda crea una entrada de historial (atrás vuelve al
      // listado sin buscar); seguir escribiendo la reemplaza (sin una entrada por tecla).
      if (onCatalog && urlQ) router.replace(href, { scroll: false });
      else router.push(href, { scroll: !onCatalog });
    });
  }

  // input → URL, con debounce.
  useEffect(() => {
    const clean = sanitizeSearch(query) ?? "";
    if (clean === urlQ) return;
    if (!onCatalog && usefulLength(clean) < MIN_CHARS_OUTSIDE_CATALOG) return;
    timer.current = setTimeout(() => go(clean), SEARCH_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // go depende de la URL actual, que ya está en las dependencias (urlQ / onCatalog).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, urlQ, onCatalog]);

  // Enter / botón "buscar" del teclado: sin esperar; cierra el teclado en móvil.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    const clean = sanitizeSearch(query) ?? "";
    if (clean !== urlQ || !onCatalog) go(clean);
    (event.currentTarget.elements.namedItem("q") as HTMLInputElement | null)?.blur();
  }

  return (
    <form
      role="search"
      action={CATALOG_PATH}
      method="get"
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className={cn("relative", className)}
    >
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <SearchIcon pending={isPending} />
      <input
        id={id}
        name="q"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar productos..."
        enterKeyHint="search"
        autoComplete="off"
        maxLength={60}
        className={inputClassName}
      />
    </form>
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
