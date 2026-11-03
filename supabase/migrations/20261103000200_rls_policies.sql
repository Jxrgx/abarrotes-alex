-- =============================================================================
-- Abarrotes Alex · Row Level Security inicial (Fase 2)
--
-- Política conservadora:
--   * Público (anon y authenticated) solo LEE lo necesario para la tienda.
--   * Nadie puede escribir mediante la API pública: no existe ninguna política
--     de INSERT/UPDATE/DELETE. Con RLS activo, ausencia de política = denegado.
--   * profiles, orders, order_items y order_status_history no tienen ninguna
--     política: inaccesibles vía API hasta la fase de Auth.
--   * La creación de pedidos será una operación server-side controlada (fase
--     posterior); no se abre INSERT público sobre orders/order_items.
--   * Las políticas administrativas se definirán en la fase de Auth, cuando se
--     decida cómo leer el rol desde profiles.
-- service_role ignora RLS (bypassrls) y solo debe usarse en servidor.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.branch_hours enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.branch_products enable row level security;
alter table public.promotions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

-- -----------------------------------------------------------------------------
-- Lectura pública del catálogo
-- Las subconsultas EXISTS también pasan por RLS de la tabla consultada, así que
-- la visibilidad se encadena (p. ej. un producto de una subcategoría inactiva
-- no es visible).
-- -----------------------------------------------------------------------------

create policy "Public can read active branches"
  on public.branches for select
  to anon, authenticated
  using (is_active);

create policy "Public can read hours of active branches"
  on public.branch_hours for select
  to anon, authenticated
  using (
    exists (select 1 from public.branches b where b.id = branch_id)
  );

create policy "Public can read active categories"
  on public.categories for select
  to anon, authenticated
  using (is_active);

create policy "Public can read active subcategories of active categories"
  on public.subcategories for select
  to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.categories c where c.id = category_id)
  );

create policy "Public can read active brands"
  on public.brands for select
  to anon, authenticated
  using (is_active);

-- La marca inactiva NO oculta el producto: solo deja de listarse la marca.
create policy "Public can read active products in visible subcategories"
  on public.products for select
  to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.subcategories s where s.id = subcategory_id)
  );

-- Incluye filas con is_available = false para poder mostrar "agotado".
create policy "Public can read branch products of visible branches and products"
  on public.branch_products for select
  to anon, authenticated
  using (
    exists (select 1 from public.branches b where b.id = branch_id)
    and exists (select 1 from public.products p where p.id = product_id)
  );

-- Solo promociones aplicables ahora: activas y dentro de su vigencia.
create policy "Public can read current promotions"
  on public.promotions for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    and exists (select 1 from public.branch_products bp where bp.id = branch_product_id)
  );

-- -----------------------------------------------------------------------------
-- Privilegios (defensa en profundidad además de RLS)
-- Supabase otorga por defecto todos los privilegios de tablas de "public" a
-- anon. TRUNCATE no está sujeto a RLS, así que se retiran las escrituras a anon.
-- authenticated conserva sus privilegios de tabla para las futuras políticas
-- administrativas; mientras no existan, RLS le niega toda escritura.
-- -----------------------------------------------------------------------------

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon;

revoke truncate, references, trigger
  on all tables in schema public
  from authenticated;

-- El folio solo debe consumirse al crear un pedido desde el servidor; evita que
-- clientes llamen next_order_folio() vía RPC y "quemen" números.
revoke execute on function public.next_order_folio() from public, anon, authenticated;
grant execute on function public.next_order_folio() to service_role;

revoke all on sequence public.order_folio_seq from anon, authenticated;
grant usage, select on sequence public.order_folio_seq to service_role;
