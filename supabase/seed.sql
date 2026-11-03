-- =============================================================================
-- Abarrotes Alex · Seed de DESARROLLO
--
-- Datos ficticios solo para desarrollo local (supabase db reset).
-- Marcas, productos, teléfonos y precios son inventados. No usar en producción.
-- No incluye pedidos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sucursal (UUID fijo para poder referenciarla fácilmente en desarrollo)
-- -----------------------------------------------------------------------------

insert into public.branches (id, name, address, phone, whatsapp_number, latitude, longitude)
values (
  '00000000-0000-4000-8000-000000000001',
  'Abarrotes Alex - Sucursal Principal',
  'Calle Ficticia 123, Col. Centro (DEV)',
  '5500000000',
  '525500000000',
  19.432608,
  -99.133209
);

-- 0 = domingo … 6 = sábado
insert into public.branch_hours (branch_id, day_of_week, opening_time, closing_time, is_closed)
select '00000000-0000-4000-8000-000000000001', d, t.opening_time, t.closing_time, false
from generate_series(0, 6) as d
cross join lateral (
  select
    case when d = 0 then time '09:00' else time '08:00' end as opening_time,
    case when d = 0 then time '15:00' else time '21:00' end as closing_time
) as t;

-- -----------------------------------------------------------------------------
-- Categorías y subcategorías
-- -----------------------------------------------------------------------------

insert into public.categories (name, slug, sort_order) values
  ('Bebidas',  'bebidas',  1),
  ('Galletas', 'galletas', 2),
  ('Lácteos',  'lacteos',  3),
  ('Botanas',  'botanas',  4),
  ('Limpieza', 'limpieza', 5);

insert into public.subcategories (category_id, name, slug, sort_order)
select c.id, s.name, s.slug, s.sort_order
from (values
  ('bebidas',  'Refrescos',    'refrescos',    1),
  ('bebidas',  'Agua',         'agua',         2),
  ('bebidas',  'Jugos',        'jugos',        3),
  ('galletas', 'Dulces',       'dulces',       1),
  ('galletas', 'Saladas',      'saladas',      2),
  ('lacteos',  'Leche',        'leche',        1),
  ('lacteos',  'Yogur',        'yogur',        2),
  ('botanas',  'Papas',        'papas',        1),
  ('botanas',  'Cacahuates',   'cacahuates',   2),
  ('limpieza', 'Detergentes',  'detergentes',  1),
  ('limpieza', 'Lavatrastes',  'lavatrastes',  2)
) as s (category_slug, name, slug, sort_order)
join public.categories c on c.slug = s.category_slug;

-- -----------------------------------------------------------------------------
-- Marcas (ficticias)
-- -----------------------------------------------------------------------------

insert into public.brands (name, slug) values
  ('Burbuja',         'burbuja'),
  ('Manantial Claro', 'manantial-claro'),
  ('Fruta Viva',      'fruta-viva'),
  ('Doña Galleta',    'dona-galleta'),
  ('Rancho Lindo',    'rancho-lindo'),
  ('Crujis',          'crujis'),
  ('Brillex',         'brillex');

-- -----------------------------------------------------------------------------
-- Productos
-- -----------------------------------------------------------------------------

insert into public.products
  (name, slug, subcategory_id, brand_id, presentation, unit, sale_type, is_featured)
select p.name, p.slug, s.id, b.id, p.presentation, p.unit::public.product_unit,
       p.sale_type::public.sale_type, p.is_featured
from (values
  ('Refresco de cola',           'refresco-cola-600-ml',        'bebidas',  'refrescos',   'burbuja',         600.0, 'ml',    'unit',   true),
  ('Refresco de cola',           'refresco-cola-2-l',           'bebidas',  'refrescos',   'burbuja',           2.0, 'L',     'unit',   false),
  ('Agua natural',               'agua-natural-1-5-l',          'bebidas',  'agua',        'manantial-claro',   1.5, 'L',     'unit',   false),
  ('Jugo de mango',              'jugo-mango-1-l',              'bebidas',  'jugos',       'fruta-viva',        1.0, 'L',     'unit',   false),
  ('Galletas de chocolate',      'galletas-chocolate-250-g',    'galletas', 'dulces',      'dona-galleta',    250.0, 'g',     'unit',   true),
  ('Galletas saladas',           'galletas-saladas-12-piezas',  'galletas', 'saladas',     'dona-galleta',     12.0, 'pieza', 'unit',   false),
  ('Leche entera',               'leche-entera-1-l',            'lacteos',  'leche',       'rancho-lindo',      1.0, 'L',     'unit',   true),
  ('Yogur bebible de fresa',     'yogur-bebible-fresa-250-g',   'lacteos',  'yogur',       'rancho-lindo',    250.0, 'g',     'unit',   false),
  ('Papas fritas con sal',       'papas-fritas-sal-45-g',       'botanas',  'papas',       'crujis',           45.0, 'g',     'unit',   false),
  -- Venta por peso: presentación 1 kg => el precio de sucursal es por kilo.
  ('Cacahuate japonés a granel', 'cacahuate-japones-granel',    'botanas',  'cacahuates',  'crujis',            1.0, 'kg',    'weight', false),
  ('Detergente en polvo',        'detergente-polvo-1-kg',       'limpieza', 'detergentes', 'brillex',           1.0, 'kg',    'unit',   false),
  ('Lavatrastes líquido',        'lavatrastes-liquido-750-ml',  'limpieza', 'lavatrastes', 'brillex',         750.0, 'ml',    'unit',   false)
) as p (name, slug, category_slug, subcategory_slug, brand_slug, presentation, unit, sale_type, is_featured)
join public.categories c on c.slug = p.category_slug
join public.subcategories s on s.category_id = c.id and s.slug = p.subcategory_slug
join public.brands b on b.slug = p.brand_slug;

-- -----------------------------------------------------------------------------
-- Precios y disponibilidad en la sucursal principal
-- -----------------------------------------------------------------------------

insert into public.branch_products (branch_id, product_id, price, is_available)
select '00000000-0000-4000-8000-000000000001', p.id, bp.price, bp.is_available
from (values
  ('refresco-cola-600-ml',        18.00, true),
  ('refresco-cola-2-l',           38.00, true),
  ('agua-natural-1-5-l',          15.00, true),
  ('jugo-mango-1-l',              28.00, false), -- agotado
  ('galletas-chocolate-250-g',    24.50, true),
  ('galletas-saladas-12-piezas',  22.00, true),
  ('leche-entera-1-l',            27.50, true),
  ('yogur-bebible-fresa-250-g',   14.00, true),
  ('papas-fritas-sal-45-g',       19.00, true),
  ('cacahuate-japones-granel',   120.00, true),
  ('detergente-polvo-1-kg',       42.00, true),
  ('lavatrastes-liquido-750-ml',  32.00, true)
) as bp (product_slug, price, is_available)
join public.products p on p.slug = bp.product_slug;

-- -----------------------------------------------------------------------------
-- Promociones
-- -----------------------------------------------------------------------------

-- Promoción manual sin fechas.
insert into public.promotions (branch_product_id, promotional_price)
select bp.id, 15.00
from public.branch_products bp
join public.products p on p.id = bp.product_id
where p.slug = 'refresco-cola-600-ml'
  and bp.branch_id = '00000000-0000-4000-8000-000000000001';

-- Promoción con vigencia relativa a la fecha del seed.
insert into public.promotions (branch_product_id, promotional_price, starts_at, ends_at)
select bp.id, 37.00, now() - interval '1 day', now() + interval '30 days'
from public.branch_products bp
join public.products p on p.id = bp.product_id
where p.slug = 'detergente-polvo-1-kg'
  and bp.branch_id = '00000000-0000-4000-8000-000000000001';
