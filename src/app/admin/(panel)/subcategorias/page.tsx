import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminLoadError, AdminPageHeader, ListSkeleton } from "@/components/admin/admin-list";
import { SubcategoryManager } from "@/components/admin/subcategory-manager";
import { listAdminSubcategories, listCategoryOptions } from "@/lib/admin/catalog";
import { loadAdminSection } from "@/lib/admin/load";

export const metadata: Metadata = { title: "Subcategorías" };

export default function SubcategoriesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader title="Subcategorías" description="Dividen cada categoría. Los productos pertenecen a una subcategoría." />
      <AdminGuard fallback={<ListSkeleton label="Cargando subcategorías" filters={1} />}>
        <SubcategoriesSection />
      </AdminGuard>
    </div>
  );
}

async function SubcategoriesSection() {
  const result = await loadAdminSection(() => Promise.all([listAdminSubcategories(), listCategoryOptions()]));
  if (!result.ok) return <AdminLoadError title="No pudimos cargar las subcategorías." retryHref="/admin/subcategorias" />;
  const [subcategories, categories] = result.data;
  return <SubcategoryManager subcategories={subcategories} categories={categories} />;
}
