-- =============================================================================
-- Catálogo paginado en la base: vista public.catalog_items (docs/catalog.md).
--
-- Antes: /productos traía TODOS los productos de la sucursal y ordenaba por precio
-- efectivo en Next.js (el precio promocional vive en otra tabla). Con +1000 productos
-- eso no escala, y paginar en la base y luego ordenar 24 filas daría un orden
-- globalmente incorrecto. La vista expone una fila por producto de la sucursal con
-- todo lo que necesita la tarjeta y el precio EFECTIVO ya calculado, así que filtro,
-- orden global, conteo y paginación ocurren en PostgreSQL (PostgREST: .order, .range,
-- count exact).
--
-- Seguridad: security_invoker = true. La vista NO salta la RLS: se evalúa con los
-- permisos de quien consulta (anon en la tienda), así que solo aparecen sucursales,
-- productos, subcategorías y categorías activos, marcas activas (si la marca está
-- inactiva el producto sigue apareciendo sin marca, como antes) y promociones vigentes.
-- No expone columnas nuevas: las mismas que la tienda ya leía por embeds.
--
-- Precio efectivo = misma semántica que lib/catalog/products.ts (bestPromoPrice):
-- la promoción visible más baja SOLO si es menor al precio normal; si no, el precio normal.
-- =============================================================================

create view public.catalog_items
with (security_invoker = true)
as
select
  bp.id,
  bp.branch_id,
  bp.product_id,
  bp.price,
  bp.is_available,
  p.name,
  p.slug,
  p.presentation,
  p.unit,
  p.sale_type,
  p.image_path,
  p.is_featured,
  p.search_name,
  p.brand_id,
  p.subcategory_id,
  b.name as brand_name,
  b.slug as brand_slug,
  s.name as subcategory_name,
  s.slug as subcategory_slug,
  s.sort_order as subcategory_sort_order,
  c.id as category_id,
  c.name as category_name,
  c.slug as category_slug,
  c.sort_order as category_sort_order,
  promo.promo_price,
  coalesce(promo.promo_price, bp.price) as effective_price
from public.branch_products bp
join public.products p on p.id = bp.product_id
join public.subcategories s on s.id = p.subcategory_id
join public.categories c on c.id = s.category_id
-- Sin marca (o marca inactiva): el producto sigue apareciendo.
left join public.brands b on b.id = p.brand_id
left join lateral (
  select case when min(pr.promotional_price) < bp.price then min(pr.promotional_price) end as promo_price
  from public.promotions pr
  where pr.branch_product_id = bp.id
) promo on true;

comment on view public.catalog_items is
  'Catálogo público por sucursal con precio efectivo (promoción vigente más baja si es menor). security_invoker: respeta la RLS de quien consulta.';

revoke all on public.catalog_items from public;
grant select on public.catalog_items to anon, authenticated;
