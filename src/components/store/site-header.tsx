import { MapPin } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { branchShortName, getCurrentBranch } from "@/lib/catalog/branches";

import { CartButton } from "./cart-button";
import { SearchField, SearchForm } from "./search-field";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <a
        href="#contenido"
        className="sr-only rounded-lg bg-background px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Saltar al contenido
      </a>

      <div className="page-container flex h-16 items-center gap-3 md:gap-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg">
          {/* Espacio reservado para el logo definitivo. */}
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            A
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base leading-tight font-semibold tracking-tight">
              Abarrotes Alex
            </span>
            {/* Móvil: la sucursal va bajo la marca. */}
            <span className="truncate text-xs leading-tight text-muted-foreground md:hidden">
              <Suspense fallback={<span className="invisible">Sucursal</span>}>
                <BranchName />
              </Suspense>
            </span>
          </span>
        </Link>

        <Suspense
          fallback={<SearchForm id="busqueda-desktop" className="hidden flex-1 md:block md:max-w-xl" />}
        >
          <SearchField id="busqueda-desktop" className="hidden flex-1 md:block md:max-w-xl" />
        </Suspense>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden items-center gap-2 text-sm lg:flex">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex flex-col leading-tight">
              <span className="text-xs text-muted-foreground">Comprando en</span>
              <span className="font-medium">
                <Suspense fallback={<span className="invisible">Sucursal</span>}>
                  <BranchName />
                </Suspense>
              </span>
            </span>
          </div>
          <CartButton count={0} />
        </div>
      </div>

      {/* Móvil: búsqueda siempre visible, sin abrir menús. */}
      <div className="page-container pb-3 md:hidden">
        <Suspense fallback={<SearchForm id="busqueda-movil" />}>
          <SearchField id="busqueda-movil" />
        </Suspense>
      </div>
    </header>
  );
}

// Si falla la consulta, el header se muestra sin sucursal en vez de romper la página.
async function BranchName() {
  try {
    const branch = await getCurrentBranch();
    return branch ? branchShortName(branch.name) : null;
  } catch {
    return null;
  }
}
