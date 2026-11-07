import { getActiveBranches } from "@/lib/catalog/branches";
import { toCents } from "@/lib/catalog/pricing";
import { getBranchProductsByIds } from "@/lib/catalog/products";
import {
  type CartProductInfo,
  type CartResolveResponse,
  cartResolveRequestSchema,
} from "@/lib/cart/schema";
import { CART_BODY_MAX_BYTES, readJsonBody } from "@/lib/http/json-body";

// Resuelve la información pública ACTUAL de los productos de un carrito.
// - Solo lectura: no crea pedidos ni modifica datos.
// - Usa el cliente público de Supabase (RLS); nunca service_role.
// - Una sola consulta por lote para todos los productos (incluye los niveles de mayoreo;
//   el precio por cantidad se calcula en el navegador con resolveUnitPrice, al instante
//   al cambiar cantidades, sin otra consulta).
// La respuesta es solo para mostrar el carrito. Al crear el pedido (Fase 6) el
// servidor volverá a consultar todo; nada de esto se acepta como autoridad.
export async function POST(request: Request) {
  // Content-Type JSON y máximo 16 KB antes de parsear (100 UUIDs caben en ~4 KB).
  const read = await readJsonBody(request, CART_BODY_MAX_BYTES);
  if (!read.ok) return Response.json({ error: "Solicitud inválida." }, { status: read.status, headers: { "Cache-Control": "no-store" } });

  const parsed = cartResolveRequestSchema.safeParse(read.data);
  if (!parsed.success) {
    return Response.json({ error: "Solicitud inválida." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { branchId, productIds } = parsed.data;
  try {
    const branch = (await getActiveBranches()).find((item) => item.id === branchId) ?? null;
    const products = branch
      ? await getBranchProductsByIds(branch.id, [...new Set(productIds)])
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
          wholesaleTiers: product.wholesaleTiers,
        }),
      ),
    };

    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // El detalle ya quedó en el log del servidor (catalogQueryError).
    return Response.json({ error: "No se pudo consultar el carrito." }, { status: 503 });
  }
}
