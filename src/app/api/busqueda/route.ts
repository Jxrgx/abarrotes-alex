import { getCurrentBranch } from "@/lib/catalog/branches";
import type { LiveSearchItem } from "@/lib/catalog/live-search";
import { toCents } from "@/lib/catalog/pricing";
import { getBranchProducts } from "@/lib/catalog/products";

// Índice ligero para la búsqueda instantánea (Fuse.js en el navegador).
// - Datos públicos: cliente sin cookies (anon, RLS), una sola consulta por sucursal.
// - Solo campos para mostrar e identificar el resultado; montos en centavos.
// - Se pide una vez por visita. Si falla, la búsqueda completa (/productos?q=) sigue igual.
// Pensado para cientos de productos; con un catálogo mucho mayor habría que
// buscar en el servidor (ver docs/catalog.md).
export async function GET() {
  try {
    const branch = await getCurrentBranch();
    const products = branch ? await getBranchProducts(branch.id) : [];

    const items: LiveSearchItem[] = products.map((product) => ({
      id: product.productId,
      slug: product.slug,
      name: product.name,
      presentation: product.priceUnit ? `Venta por ${product.priceUnit}` : product.presentation,
      brand: product.brandName,
      brandSlug: product.brandSlug,
      category: product.category.name,
      categorySlug: product.category.slug,
      subcategory: product.subcategory.name,
      subcategorySlug: product.subcategory.slug,
      imagePath: product.imagePath,
      priceCents: toCents(product.price),
      promoPriceCents: product.promoPrice === null ? null : toCents(product.promoPrice),
      isAvailable: product.isAvailable,
    }));

    return Response.json(
      { items },
      // Datos públicos: un minuto de caché en el navegador (precios casi al día).
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return Response.json({ error: "No se pudo cargar la búsqueda." }, { status: 503 });
  }
}
