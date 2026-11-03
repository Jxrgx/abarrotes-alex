-- =============================================================================
-- Abarrotes Alex · Autorización administrativa (Fase 7)
--
-- - La autoridad es auth.users + profiles.role (nunca el email).
-- - private.is_admin(): comprobación de rol para RLS (SECURITY DEFINER, sin
--   recursión sobre profiles).
-- - Políticas de administración para catálogo y pedidos. Desactivación lógica
--   en lugar de DELETE donde existe is_active.
-- - Nadie puede crear, editar ni borrar profiles desde la API: el rol no se
--   puede auto-asignar. El primer admin se crea con SQL (ver docs/auth.md).
-- Ver docs/auth.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- is_admin
-- SECURITY DEFINER: lee profiles sin pasar por su RLS (evita recursión y no
-- requiere abrir lectura de profiles). search_path vacío y nombres calificados.
-- Vive en `private` (no expuesto por la API); solo authenticated puede usarla.
-- -----------------------------------------------------------------------------

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

comment on function private.is_admin() is
  'true si el usuario autenticado tiene profiles.role = admin. Para políticas RLS.';

revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- profiles: cada usuario lee únicamente su propio profile. Sin escritura vía API.
-- -----------------------------------------------------------------------------

create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Catálogo: el admin lee todo (también inactivos), inserta y actualiza.
-- (select private.is_admin()) se evalúa una vez por consulta (initplan).
-- -----------------------------------------------------------------------------

create policy "Admins can read branches" on public.branches
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert branches" on public.branches
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update branches" on public.branches
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Admins can read branch hours" on public.branch_hours
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert branch hours" on public.branch_hours
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update branch hours" on public.branch_hours
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Admins can read categories" on public.categories
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert categories" on public.categories
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update categories" on public.categories
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Admins can read subcategories" on public.subcategories
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert subcategories" on public.subcategories
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update subcategories" on public.subcategories
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Admins can read brands" on public.brands
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert brands" on public.brands
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update brands" on public.brands
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Admins can read products" on public.products
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert products" on public.products
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update products" on public.products
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- branch_products: asignar/quitar un producto de una sucursal es configuración;
-- DELETE permitido (los pedidos guardan snapshot, no dependen de esta fila).
create policy "Admins can read branch products" on public.branch_products
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert branch products" on public.branch_products
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update branch products" on public.branch_products
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete branch products" on public.branch_products
  for delete to authenticated using ((select private.is_admin()));

-- promotions: también se pueden desactivar, pero borrar una promoción creada
-- por error no afecta pedidos (order_items guarda el precio aplicado).
create policy "Admins can read promotions" on public.promotions
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert promotions" on public.promotions
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update promotions" on public.promotions
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete promotions" on public.promotions
  for delete to authenticated using ((select private.is_admin()));

-- Sin DELETE para entidades con desactivación lógica (defensa adicional a RLS).
revoke delete on public.branches, public.branch_hours, public.categories, public.subcategories,
  public.brands, public.products
  from authenticated;

-- -----------------------------------------------------------------------------
-- Pedidos: el admin lee todo y solo puede cambiar `status`.
-- Crear pedidos sigue siendo exclusivo de public.create_order.
-- -----------------------------------------------------------------------------

create policy "Admins can read orders" on public.orders
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can update order status" on public.orders
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Admins can read order items" on public.order_items
  for select to authenticated using ((select private.is_admin()));

create policy "Admins can read order status history" on public.order_status_history
  for select to authenticated using ((select private.is_admin()));

-- Privilegios por columna: de orders solo se puede actualizar status.
revoke insert, update, delete on public.orders from authenticated;
grant update (status) on public.orders to authenticated;
revoke insert, update, delete on public.order_items, public.order_status_history from authenticated;

-- Cada cambio de status queda en el historial con quién lo hizo (auth.uid();
-- NULL si lo hace el sistema). SECURITY DEFINER: el historial no tiene INSERT
-- para usuarios; solo este trigger y create_order escriben en él.
create function private.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, previous_status, new_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function private.log_order_status_change() from public, anon, authenticated;

create trigger log_status_change
  after update of status on public.orders
  for each row execute function private.log_order_status_change();
