import { getActiveBranches } from "@/lib/catalog/branches";
import { toCents } from "@/lib/catalog/pricing";
import { getBranchProducts } from "@/lib/catalog/products";
import {
  type CartProductInfo,
  type CartResolveResponse,
  cartResolveRequestSchema,
} from "@/lib/cart/schema";

// Resuelve la información pública ACTUAL de los productos de un carrito.
// - Solo lectura: no crea pedidos ni modifica datos.
// - Usa el cliente público de Supabase (RLS); nunca service_role.
// - Una sola consulta por lote para todos los productos.
// La respuesta es solo para mostrar el carrito. Al crear el pedido (Fase 6) el
// servidor volverá a consultar todo; nada de esto se acepta como autoridad.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = cartResolveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const { branchId, productIds } = parsed.data;
  try {
    const branch = (await getActiveBranches()).find((item) => item.id === branchId) ?? null;
    const products = branch
      ? await getBranchProducts(branch.id, { productIds: [...new Set(productIds)] })
      : [];

    const response: CartResolveResponse = {
      branch: branch && { id: branch.id, name: branch.name },
      products: products.map(
        (product): CartProductInfo => ({
          productId: product.productId,
          name: product.name,
          brandName: product.brandName,
          presentation: product.presentation,
          priceUnit: product.priceUnit,
          imagePath: product.imagePath,
          isAvailable: product.isAvailable,
          priceCents: toCents(product.price),
          promoPriceCents: product.promoPrice === null ? null : toCents(product.promoPrice),
        }),
      ),
    };

    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // El detalle ya quedó en el log del servidor (catalogQueryError).
    return Response.json({ error: "No se pudo consultar el carrito." }, { status: 503 });
  }
}
