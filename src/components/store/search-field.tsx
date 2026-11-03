"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useTransition } from "react";

import {
  CATALOG_PATH,
  type CatalogFilters,
  catalogHref,
  parseCatalogParams,
  sanitizeSearch,
} from "@/lib/catalog/filters";
import { cn } from "@/lib/utils";

import { Spinner } from "./pending-hint";

type SearchFieldProps = { id: string; className?: string };

// Búsqueda explícita (Enter). Desde /productos conserva categoría, subcategoría,
// marca y orden; desde cualquier otra página empieza una búsqueda nueva.
export function SearchField({ id, className }: SearchFieldProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const onCatalog = pathname === CATALOG_PATH;
  const current: CatalogFilters = onCatalog
    ? parseCatalogParams(Object.fromEntries(searchParams.entries()))
    : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    const q = sanitizeSearch(typeof value === "string" ? value : undefined);
    startTransition(() => router.push(catalogHref({ ...current, q })));
  }

  return (
    <SearchForm
      id={id}
      className={className}
      // key: al navegar, el campo refleja la búsqueda de la URL.
      key={current.q ?? ""}
      defaultValue={current.q}
      onSubmit={handleSubmit}
      isPending={isPending}
    />
  );
}

// Versión sin hooks para el shell estático (Suspense). Sin JavaScript también
// funciona: el formulario hace un GET normal a /productos?q=...
export function SearchForm({
  id,
  className,
  defaultValue,
  onSubmit,
  isPending = false,
}: SearchFieldProps & {
  defaultValue?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  isPending?: boolean;
}) {
  return (
    <form
      role="search"
      action={CATALOG_PATH}
      method="get"
      onSubmit={onSubmit}
      aria-busy={isPending}
      className={cn("relative", className)}
    >
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      {isPending ? (
        <Spinner className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
      ) : (
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
          aria-hidden="true"
        />
      )}
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Buscar productos..."
        enterKeyHint="search"
        autoComplete="off"
        maxLength={60}
        className="h-10 w-full rounded-lg border border-input bg-background-secondary pr-3 pl-9 text-base text-foreground transition-colors duration-150 placeholder:text-subtle-foreground hover:border-subtle-foreground/40 focus:bg-background md:text-sm"
      />
    </form>
  );
}
