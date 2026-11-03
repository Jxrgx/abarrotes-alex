import { CartAnnouncer } from "@/components/cart/cart-announcer";
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
      <CartAnnouncer />
    </>
  );
}
