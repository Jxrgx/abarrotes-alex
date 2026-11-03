-- =============================================================================
-- Abarrotes Alex · Esquema inicial (Fase 2)
--
-- Modelo multisucursal: el catálogo (categorías, subcategorías, marcas,
-- productos) es global; precio, disponibilidad y promociones son por sucursal
-- (branch_products / promotions). Los pedidos pertenecen a una sucursal y sus
-- partidas guardan un snapshot del producto al momento de la compra.
--
-- Ver docs/database.md para el detalle de las decisiones.
-- =============================================================================

-- gen_random_uuid() es nativo desde PostgreSQL 13; no requiere pgcrypto.

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- Se pueden ampliar después con: ALTER TYPE ... ADD VALUE '...';
-- -----------------------------------------------------------------------------

create type public.user_role as enum ('admin', 'employee');

create type public.sale_type as enum ('unit', 'weight');

-- Unidad de la presentación del producto (600 ml, 1.5 L, 250 g, 1 kg, 12 pieza).
create type public.product_unit as enum ('ml', 'L', 'g', 'kg', 'pieza');

create type public.delivery_type as enum ('delivery', 'pickup');

-- Inicialmente solo efectivo. Para habilitar otros métodos (transfer, card,
-- online) basta una migración con ALTER TYPE public.payment_method ADD VALUE.
create type public.payment_method as enum ('cash');

create type public.order_status as enum (
  'new',
  'confirmed',
  'preparing',
  'ready',
  'on_the_way',
  'ready_for_pickup',
  'delivered',
  'cancelled'
);

-- -----------------------------------------------------------------------------
-- updated_at automático (función reutilizable + un trigger por tabla)
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: 1 a 1 con auth.users
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.user_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Usuarios administrativos. id = auth.users.id. La creación automática del profile se definirá en la fase de Auth.';

-- -----------------------------------------------------------------------------
-- branches
-- -----------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  address text,
  phone text,
  -- Solo dígitos, formato internacional sin "+" (p. ej. 52 + 10 dígitos).
  -- Así se usa directamente en https://wa.me/<whatsapp_number>.
  whatsapp_number text check (whatsapp_number ~ '^[1-9][0-9]{7,14}$'),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Coordenadas: ambas o ninguna.
  constraint branches_coordinates_pair check ((latitude is null) = (longitude is null))
);

-- -----------------------------------------------------------------------------
-- branch_hours
-- day_of_week: 0 = domingo … 6 = sábado (igual que EXTRACT(DOW) en PostgreSQL
-- y Date.prototype.getDay() en JavaScript).
-- -----------------------------------------------------------------------------

create table public.branch_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opening_time time,
  closing_time time,
  is_closed boolean not null default false,
  constraint branch_hours_branch_day_key unique (branch_id, day_of_week),
  -- Si el día está abierto se requieren ambos horarios y el cierre debe ser
  -- posterior a la apertura (no se contemplan horarios que crucen medianoche).
  constraint branch_hours_open_times check (
    is_closed
    or (opening_time is not null and closing_time is not null and closing_time > opening_time)
  )
);

-- -----------------------------------------------------------------------------
-- Catálogo global
-- Formato de slug: minúsculas, dígitos y guiones (p. ej. "agua-natural-1-5-l").
-- -----------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- slug único DENTRO de la categoría: las URLs serán anidadas
-- (/categoria/<category.slug>/<subcategory.slug>), por lo que dos categorías
-- pueden tener, p. ej., una subcategoría "otros".
create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcategories_category_slug_key unique (category_id, slug)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La categoría NO se guarda aquí: products -> subcategories -> categories.
-- El precio NO se guarda aquí: vive en branch_products (por sucursal).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subcategory_id uuid not null references public.subcategories (id) on delete restrict,
  brand_id uuid not null references public.brands (id) on delete restrict,
  -- Cantidad de la presentación: 600 / 1.5 / 250 / 1 / 12.
  presentation numeric(10, 3) check (presentation > 0),
  unit public.product_unit,
  sale_type public.sale_type not null default 'unit',
  -- Object path dentro del bucket de Storage (p. ej. "products/<uuid>.webp"),
  -- nunca una URL pública completa.
  image_path text check (image_path !~* '^[a-z][a-z0-9+.-]*://' and image_path !~ '^/'),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Presentación y unidad van juntas: ambas o ninguna.
  constraint products_presentation_unit_pair check ((presentation is null) = (unit is null))
);

-- -----------------------------------------------------------------------------
-- branch_products: precio y disponibilidad por sucursal
-- -----------------------------------------------------------------------------

create table public.branch_products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_products_branch_product_key unique (branch_id, product_id)
);

-- -----------------------------------------------------------------------------
-- promotions: solo precio promocional sobre un producto de una sucursal
-- -----------------------------------------------------------------------------

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  branch_product_id uuid not null references public.branch_products (id) on delete cascade,
  promotional_price numeric(10, 2) not null check (promotional_price >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_valid_range check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

-- -----------------------------------------------------------------------------
-- Folios de pedido: ALEX-000001, ALEX-000002, …
-- Una SEQUENCE es atómica y segura ante concurrencia (nextval nunca entrega el
-- mismo número a dos transacciones). Puede dejar huecos si una transacción
-- hace rollback; es aceptable para un folio humano.
-- -----------------------------------------------------------------------------

create sequence public.order_folio_seq as bigint start with 1 increment by 1;

create function public.next_order_folio()
returns text
language sql
volatile
set search_path = ''
as $$
  -- Mínimo 6 dígitos; si se supera 999999 crece en lugar de truncarse.
  select 'ALEX-' || lpad(n::text, greatest(6, length(n::text)), '0')
  from (select nextval('public.order_folio_seq') as n) as s;
$$;

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default public.next_order_folio()
    check (folio ~ '^ALEX-[0-9]{6,}$'),
  branch_id uuid not null references public.branches (id) on delete restrict,

  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 120),
  -- Solo dígitos (normalizado en servidor).
  customer_phone text not null check (customer_phone ~ '^[0-9]{10,15}$'),

  delivery_type public.delivery_type not null,

  address text check (char_length(address) <= 300),
  neighborhood text check (char_length(neighborhood) <= 120),
  -- "references" es palabra reservada en SQL; se usa address_references.
  address_references text check (char_length(address_references) <= 300),

  payment_method public.payment_method not null default 'cash',
  -- Con cuánto paga el cliente (para preparar cambio). Opcional.
  cash_amount numeric(10, 2) check (cash_amount >= 0),

  customer_notes text check (char_length(customer_notes) <= 500),

  subtotal numeric(10, 2) not null check (subtotal >= 0),
  -- NULL = envío "por confirmar".
  shipping_cost numeric(10, 2) check (shipping_cost >= 0),
  -- Total conocido por el sistema: subtotal + envío (si ya se conoce).
  total numeric(10, 2) not null check (total >= 0),

  status public.order_status not null default 'new',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_total_matches check (total = subtotal + coalesce(shipping_cost, 0)),
  -- A domicilio requiere dirección; recoger en tienda la permite vacía.
  constraint orders_delivery_address check (
    delivery_type <> 'delivery' or char_length(btrim(coalesce(address, ''))) > 0
  ),
  -- cash_amount solo tiene sentido al pagar en efectivo.
  constraint orders_cash_amount_method check (cash_amount is null or payment_method = 'cash')
);

-- -----------------------------------------------------------------------------
-- order_items: snapshot histórico de cada partida
-- product_id se conserva como referencia, pero nombre, presentación y precio
-- se copian al crear el pedido y no dependen del catálogo actual.
-- -----------------------------------------------------------------------------

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null check (char_length(btrim(product_name)) > 0),
  -- Texto ya formateado, p. ej. "600 ml".
  product_presentation text,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  -- numeric para permitir venta por peso (p. ej. 0.5 kg).
  quantity numeric(10, 3) not null check (quantity > 0),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_subtotal_matches check (subtotal = round(unit_price * quantity, 2))
);

-- -----------------------------------------------------------------------------
-- order_status_history
-- changed_by NULL = cambio originado por el sistema.
-- -----------------------------------------------------------------------------

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  previous_status public.order_status,
  new_status public.order_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_status_history_changed check (previous_status is distinct from new_status)
);

-- -----------------------------------------------------------------------------
-- Índices
-- Las restricciones UNIQUE ya crean índice para: categories.slug, brands.slug,
-- products.slug, orders.folio, subcategories(category_id, slug),
-- branch_hours(branch_id, day_of_week) y branch_products(branch_id, product_id).
-- Esos índices compuestos también cubren las búsquedas por su primera columna.
-- -----------------------------------------------------------------------------

-- Listado de productos por subcategoría (navegación de la tienda).
create index products_subcategory_id_idx on public.products (subcategory_id);
-- Filtro por marca y verificación del FK al eliminar una marca.
create index products_brand_id_idx on public.products (brand_id);

-- Búsqueda de un producto en todas las sucursales y cascada al eliminarlo.
create index branch_products_product_id_idx on public.branch_products (product_id);

-- Promociones vigentes de un producto de sucursal (solo las activas).
create index promotions_active_branch_product_idx
  on public.promotions (branch_product_id)
  where is_active;

-- Panel: pedidos de una sucursal, más recientes primero.
create index orders_branch_id_created_at_idx on public.orders (branch_id, created_at desc);
-- Panel: colas por estado (nuevos, en preparación, …), más recientes primero.
create index orders_status_created_at_idx on public.orders (status, created_at desc);

-- Partidas de un pedido.
create index order_items_order_id_idx on public.order_items (order_id);
-- Verificación del FK RESTRICT al intentar eliminar un producto.
create index order_items_product_id_idx on public.order_items (product_id);

-- Historial de un pedido en orden cronológico.
create index order_status_history_order_id_created_at_idx
  on public.order_status_history (order_id, created_at);

-- -----------------------------------------------------------------------------
-- Triggers updated_at
-- -----------------------------------------------------------------------------

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subcategories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.branch_products
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
