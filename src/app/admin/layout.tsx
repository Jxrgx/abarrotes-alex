import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Panel administrativo", template: "%s | Admin · Abarrotes Alex" },
  robots: { index: false, follow: false },
  // PWA del panel (instalable desde Chrome Android). Solo /admin enlaza este manifest;
  // la tienda tiene el suyo (/tienda.webmanifest, start_url "/"). Ver docs/notifications.md.
  manifest: "/admin.webmanifest",
};

// Base de /admin: sin el header ni el footer de la tienda.
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
