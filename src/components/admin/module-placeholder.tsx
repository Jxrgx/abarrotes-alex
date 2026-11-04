import { Construction } from "lucide-react";
import Link from "next/link";

export function ModulePlaceholderSkeleton({ title }: { title: string }) {
  return (
    <div role="status" aria-label={`Cargando ${title}`} className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      <div className="mt-5 h-44 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

// Módulo todavía no implementado: protegido y con el layout del panel.
export function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-background-secondary">
          <Construction className="size-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <p className="font-medium">Módulo en construcción</p>
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        <Link href="/admin" className="inline-flex h-10 items-center text-sm font-medium text-primary hover:text-primary-hover">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
