import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminLoadError, AdminPageHeader, ListSkeleton } from "@/components/admin/admin-list";
import { ProductManager } from "@/components/admin/product-manager";
import { getAdminBranch } from "@/lib/admin/dashboard";
import { loadAdminSection } from "@/lib/admin/load";
import { getProductFormOptions, listAdminProducts } from "@/lib/admin/products";

export const metadata: Metadata = { title: "Productos" };

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Productos"
        description="Activo: se muestra en la tienda. Agotado: se muestra, pero no se puede comprar. Inactivo: no se muestra."
      />
      <AdminGuard fallback={<ListSkeleton label="Cargando productos" filters={3} />}>
        <ProductsSection />
      </AdminGuard>
    </div>
  );
}

async function ProductsSection() {
  const result = await loadAdminSection(() => Promise.all([listAdminProducts(), getProductFormOptions(), getAdminBranch()]));
  if (!result.ok) return <AdminLoadError title="No pudimos cargar los productos." retryHref="/admin/productos" />;
  const [products, options, branch] = result.data;
  return <ProductManager products={products} options={options} branchId={branch?.id ?? null} />;
}
