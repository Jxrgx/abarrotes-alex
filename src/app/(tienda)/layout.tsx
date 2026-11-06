import { Suspense } from "react";

import { CartAnnouncer } from "@/components/cart/cart-announcer";
import { CartBar } from "@/components/store/cart-bar";
import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";

// PWA de la tienda para clientes (id/start_url/scope "/"). Separada de la del panel
// (/admin.webmanifest, enlazada solo desde src/app/admin/layout.tsx): instalar la
// tienda abre la tienda, nunca /admin. Ver docs/notifications.md.
// Se enlaza con <link> (React lo coloca en <head> desde el shell estático) y no con
// metadata.manifest: en páginas con generateMetadata dinámico (/productos) Next.js
// transmite los metadatos al final de <body>, y Chrome solo lee el manifest en <head>.
const STORE_MANIFEST = "/tienda.webmanifest";

// Layout de la tienda pública. El panel administrativo tendrá su propio grupo.
export default function StoreLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <link rel="manifest" href={STORE_MANIFEST} />
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
