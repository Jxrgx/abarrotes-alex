import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminLoadError, AdminPageHeader, ListSkeleton } from "@/components/admin/admin-list";
import { BrandManager } from "@/components/admin/brand-manager";
import { listAdminBrands } from "@/lib/admin/catalog";
import { loadAdminSection } from "@/lib/admin/load";

export const metadata: Metadata = { title: "Marcas" };

export default function BrandsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader title="Marcas" description="Opcionales en cada producto. Se muestran como filtro y en las tarjetas de la tienda." />
      <AdminGuard fallback={<ListSkeleton label="Cargando marcas" />}>
        <BrandsSection />
      </AdminGuard>
    </div>
  );
}

async function BrandsSection() {
  const result = await loadAdminSection(listAdminBrands);
  if (!result.ok) return <AdminLoadError title="No pudimos cargar las marcas." retryHref="/admin/marcas" />;
  return <BrandManager brands={result.data} />;
}
