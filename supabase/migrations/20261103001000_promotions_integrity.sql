-- =============================================================================
-- Abarrotes Alex · Fase 8D — Integridad de promociones
-- =============================================================================
-- Semántica de vigencia (sin cambios; la misma de la RLS pública y de create_order):
--   vigente ⇔ is_active AND (starts_at IS NULL OR starts_at <= now())
--                       AND (ends_at   IS NULL OR ends_at   >  now())
-- es decir, ventana semiabierta [starts_at, ends_at) con NULL = sin límite.
-- La tienda y create_order además solo aplican la promoción si es menor al precio.
--
-- Esta migración convierte dos reglas del panel en reglas de la BASE (autoridad
-- también ante escrituras concurrentes o fuera de la UI):
--   1. Sin solapamiento: para un mismo branch_product no puede haber dos promociones
--      ACTIVAS cuyas ventanas se crucen (exclusion constraint, sin condiciones de carrera).
--   2. Descuento real: al crear, cambiar el precio promocional o reactivar, el precio
--      promocional debe ser menor que el precio normal actual (trigger).

-- btree_gist: extensión estándar de PostgreSQL (incluida en Supabase) que permite
-- combinar igualdad (uuid) y solapamiento de rangos (&&) en una constraint GiST.
create extension if not exists btree_gist with schema extensions;

-- 1. Solapamiento. tstzrange(starts_at, ends_at, '[)'): NULL = -∞ / +∞, y el mismo
--    criterio semiabierto que la vigencia: una promoción que termina a las 10:00 y otra
--    que empieza a las 10:00 NO se cruzan. Las inactivas no cuentan.
alter table public.promotions
  add constraint promotions_no_overlap
  exclude using gist (
    branch_product_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (is_active);

-- 2. Precio y producto. SECURITY INVOKER: lee branch_products con la RLS del usuario
--    (el admin la ve; otros roles ni siquiera pueden escribir promotions).
create function private.validate_promotion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric(10, 2);
begin
  if tg_op = 'UPDATE' and new.branch_product_id <> old.branch_product_id then
    -- El producto de una promoción no cambia: se desactiva y se crea otra.
    raise exception 'PROMO_PRODUCT_LOCKED' using errcode = 'PRM02';
  end if;

  -- Solo cuando la promoción queda activa y algo relevante cambia: alta, nuevo precio
  -- promocional o reactivación. Editar fechas o desactivar una promoción que quedó por
  -- encima del precio (porque el precio normal bajó) sigue permitido.
  if new.is_active and (
    tg_op = 'INSERT'
    or new.promotional_price <> old.promotional_price
    or not old.is_active
  ) then
    select bp.price into v_price from public.branch_products bp where bp.id = new.branch_product_id;
    if v_price is not null and new.promotional_price >= v_price then
      raise exception 'PROMO_PRICE_NOT_LOWER' using errcode = 'PRM01';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_promotion() from public, anon, authenticated;

create trigger validate_promotion
  before insert or update on public.promotions
  for each row execute function private.validate_promotion();
