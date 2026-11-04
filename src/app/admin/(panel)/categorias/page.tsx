import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminLoadError, AdminPageHeader, ListSkeleton } from "@/components/admin/admin-list";
import { CategoryManager } from "@/components/admin/category-manager";
import { listAdminCategories } from "@/lib/admin/catalog";
import { loadAdminSection } from "@/lib/admin/load";

export const metadata: Metadata = { title: "Categorías" };

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader title="Categorías" description="Los pasillos de la tienda. El orden define cómo aparecen en el catálogo." />
      <AdminGuard fallback={<ListSkeleton label="Cargando categorías" />}>
        <CategoriesSection />
      </AdminGuard>
    </div>
  );
}

async function CategoriesSection() {
  const result = await loadAdminSection(listAdminCategories);
  if (!result.ok) return <AdminLoadError title="No pudimos cargar las categorías." retryHref="/admin/categorias" />;
  return <CategoryManager categories={result.data} />;
}
