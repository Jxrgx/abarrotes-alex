"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

// Nunca se muestra el error: el detalle técnico queda en los logs del servidor.
export default function StoreError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="page-container py-16">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          No pudimos cargar la tienda
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tuvimos un problema al consultar los productos. Inténtalo de nuevo en unos momentos.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => retry()}>
            <RefreshCw aria-hidden="true" />
            Intentar de nuevo
          </Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
