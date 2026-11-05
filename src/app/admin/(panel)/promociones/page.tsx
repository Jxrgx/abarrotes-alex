import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminLoadError, AdminPageHeader, ListSkeleton } from "@/components/admin/admin-list";
import type { PromotableOption } from "@/components/admin/promotion-form";
import { PromotionManager } from "@/components/admin/promotion-manager";
import { loadAdminSection } from "@/lib/admin/load";
import { getProductFormOptions, listAdminProducts } from "@/lib/admin/products";
import { listAdminPromotions } from "@/lib/admin/promotions";

export const metadata: Metadata = { title: "Promociones" };

export default function PromotionsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Promociones"
        description="Precio especial de un producto en una sucursal. Solo se aplica si es menor al precio normal."
      />
      <AdminGuard fallback={<ListSkeleton label="Cargando promociones" filters={1} />}>
        <PromotionsSection />
      </AdminGuard>
    </div>
  );
}

async function PromotionsSection() {
  const result = await loadAdminSection(() => Promise.all([listAdminPromotions(), listAdminProducts(), getProductFormOptions()]));
  if (!result.ok) return <AdminLoadError title="No pudimos cargar las promociones." retryHref="/admin/promociones" />;
  const [promotions, products, formOptions] = result.data;
  const branchName = new Map(formOptions.branches.map((branch) => [branch.id, branch.name]));

  // Promocionables: productos ACTIVOS en sucursales activas (uno por branch_product).
  const activeBranches = new Set(formOptions.branches.filter((branch) => branch.isActive).map((branch) => branch.id));
  const options: PromotableOption[] = products
    .filter((product) => product.isActive)
    .flatMap((product) =>
      Object.values(product.prices)
        .filter((price) => activeBranches.has(price.branchId))
        .map((price) => ({
          branchProductId: price.id,
          productName: product.name,
          presentation: product.presentation,
          brandName: product.brandName,
          categoryName: product.categoryName,
          subcategoryName: product.subcategoryName,
          branchName: branchName.get(price.branchId) ?? "",
          priceCents: price.priceCents,
          isAvailable: price.isAvailable,
          imagePath: product.imagePath,
        })),
    );

  return (
    <PromotionManager
      promotions={promotions}
      options={options}
      branches={formOptions.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      // Hora de la petición (el panel es dinámico): todos los estados con el mismo "ahora".
      nowIso={new Date().toISOString()}
    />
  );
}
