import { type ReactNode, Suspense } from "react";

import { requireAdmin } from "@/lib/auth/session";

// Verificación de admin de cada PÁGINA del panel, dentro de su propio <Suspense>.
//
// requireAdmin() usa cookies + connection(). En una navegación del cliente solo se
// vuelve a renderizar lo que está debajo del layout compartido, así que el <Suspense>
// del layout no cubre a la página: llamarla en la raíz de la página bloquea la
// navegación (Next.js lo reporta como "uncached data … outside of <Suspense>").
// Aquí la página muestra su fallback al instante y el contenido protegido (children)
// solo se renderiza DESPUÉS de verificar sesión y rol; sus consultas no empiezan antes.
export function AdminGuard({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <Guarded>{children}</Guarded>
    </Suspense>
  );
}

async function Guarded({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
