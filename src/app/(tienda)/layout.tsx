import { Suspense } from "react";

import { CartAnnouncer } from "@/components/cart/cart-announcer";
import { CartBar } from "@/components/store/cart-bar";
import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";

// Layout de la tienda pública. El panel administrativo tendrá su propio grupo.
export default function StoreLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {/* Después del footer: su espacio reservado queda al final de la página. Suspense:
          usePathname es dato de la URL (Cache Components) y la barra solo existe en el cliente. */}
      <Suspense fallback={null}>
        <CartBar />
      </Suspense>
      <CartAnnouncer />
    </>
  );
}
