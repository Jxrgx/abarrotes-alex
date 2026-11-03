import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

// Solo visual: la búsqueda funcional llega en la Fase 4B. El campo está
// deshabilitado de verdad y lo indica con texto, para no simular una búsqueda.
export function SearchField({ id, className }: { id: string; className?: string }) {
  return (
    <div role="search" className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        Buscar productos (disponible próximamente)
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        disabled
        placeholder="Buscar productos..."
        className="h-10 w-full rounded-lg border border-input bg-background-secondary pr-24 pl-9 text-base text-foreground placeholder:text-subtle-foreground disabled:cursor-not-allowed md:text-sm"
      />
      <span
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border"
        aria-hidden="true"
      >
        Próximamente
      </span>
    </div>
  );
}
