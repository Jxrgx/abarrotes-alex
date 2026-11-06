import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página no encontrada" };

// 404 de rutas inexistentes (fuera de la tienda y del panel): sin consultas ni datos.
export default function NotFound() {
  return (
    <main id="contenido" className="page-container flex flex-1 items-center justify-center py-16">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-background-secondary ring-1 ring-border">
          <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">No encontramos esta página</h1>
        <p className="mt-2 text-muted-foreground">Puede que el enlace sea incorrecto o que la página ya no exista.</p>
        <div className="mt-6 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Link href="/" className={buttonVariants()}>
            Ir al inicio
          </Link>
          <Link href="/productos" className={buttonVariants({ variant: "secondary" })}>
            Ver productos
          </Link>
        </div>
      </div>
    </main>
  );
}
