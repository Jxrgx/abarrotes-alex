import { Suspense } from "react";

import { getCurrentBranch } from "@/lib/catalog/branches";
import { formatPhone } from "@/lib/format";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-background-secondary">
      <div className="page-container py-8 text-sm">
        <p className="text-base font-semibold tracking-tight">Abarrotes Alex</p>
        <Suspense fallback={<div className="h-16" />}>
          <FooterDetails />
        </Suspense>
      </div>
    </footer>
  );
}

async function FooterDetails() {
  let branch = null;
  try {
    branch = await getCurrentBranch();
  } catch {
    // Sin datos de sucursal el footer sigue siendo útil.
  }
  // Se calcula después de la consulta para no romper el prerender (Cache Components).
  const year = new Date().getFullYear();

  return (
    <>
      {branch && (
        <address className="mt-2 space-y-1 text-muted-foreground not-italic">
          <p>{branch.name}</p>
          {branch.address && <p>{branch.address}</p>}
          {branch.phone && (
            <p>
              Tel.{" "}
              <a
                href={`tel:${branch.phone}`}
                className="inline-flex min-h-10 items-center rounded-md text-foreground underline-offset-4 hover:underline"
              >
                {formatPhone(branch.phone)}
              </a>
            </p>
          )}
        </address>
      )}
      <p className="mt-6 text-subtle-foreground">© {year} Abarrotes Alex. Todos los derechos reservados.</p>
    </>
  );
}
