-- =============================================================================
-- Abarrotes Alex · Precios por mayoreo (docs/wholesale.md)
-- =============================================================================
-- Precio unitario por volumen para un producto EN UNA SUCURSAL (branch_products):
--   3–5 pzas → $20.00 c/u · 6–11 → $18.50 · 12+ → $17.00
-- Al alcanzar un escalón, su precio aplica a TODAS las unidades de la partida (no es
-- descuento marginal). Solo productos de venta por unidad (sale_type = 'unit').
--
-- Regla de precio ÚNICA (private.line_price): el cliente recibe el MEJOR precio
-- unitario disponible para su cantidad:
--   min(precio normal, promoción vigente < normal, mayoreo aplicable < normal)
-- Empate exacto promoción = mayoreo → gana 'promotion' (determinista).
--
-- Integridad en la BASE (no solo en el panel):
--   - Rangos: min_quantity 2..99, max_quantity NULL (sin límite) o min..99.
--   - Sin solapamiento por producto-sucursal: exclusion constraint (sin carreras).
--   - Precios no crecientes al subir la cantidad: constraint trigger que bloquea la fila
--     de branch_products (serializa escrituras concurrentes del mismo producto).
--   - Precio > 0 y < precio normal al crear o cambiar el precio del nivel (trigger). Si
--     después baja el precio normal, el nivel NO se borra ni bloquea la edición: queda
--     «Requiere revisión» y deja de aplicarse (mismo patrón que promociones, Fase 8D).
--   - Solo productos por unidad (trigger + filtro en el cálculo).
-- Pedidos: order_items.pricing_type guarda qué regla ganó (snapshot histórico).
-- Estructura únicamente: no inserta ni modifica datos de negocio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla
-- -----------------------------------------------------------------------------

create table public.wholesale_prices (
  id uuid primary key default gen_random_uuid(),
  branch_product_id uuid not null references public.branch_products (id) on delete cascade,
  min_quantity integer not null,
  -- NULL = sin límite superior ("12+").
  max_quantity integer,
  unit_price numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 99 = cantidad máxima por producto en el carrito y en create_order.
  constraint wholesale_prices_min_quantity_range check (min_quantity between 2 and 99),
  constraint wholesale_prices_max_quantity_range check (max_quantity is null or max_quantity between min_quantity and 99),
  constraint wholesale_prices_unit_price_positive check (unit_price > 0),
  -- Rangos inclusivos [min, max]; NULL = +∞. DEFERRABLE para que admin_save_product
  -- pueda reacomodar varios niveles en una transacción (se verifica al final de la
  -- función con SET CONSTRAINTS … IMMEDIATE). Fuera de esa función es inmediato.
  constraint wholesale_prices_no_overlap exclude using gist (
    branch_product_id with =,
    int4range(min_quantity, max_quantity, '[]') with &&
  ) deferrable initially immediate
);

comment on table public.wholesale_prices is
  'Precios por mayoreo (precio unitario por cantidad) de un producto en una sucursal. Ver docs/wholesale.md.';
comment on column public.wholesale_prices.max_quantity is 'NULL = sin límite superior.';

create index wholesale_prices_branch_product_idx on public.wholesale_prices (branch_product_id, min_quantity);

create trigger set_updated_at before update on public.wholesale_prices
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Validación por fila: producto fijo, solo venta por unidad y precio < normal
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER: lee branch_products/products con la RLS de quien escribe (el admin
-- los ve; ningún otro rol puede escribir wholesale_prices).
create function private.validate_wholesale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric(10, 2);
  v_sale_type public.sale_type;
begin
  if tg_op = 'UPDATE' and new.branch_product_id <> old.branch_product_id then
    raise exception 'WHOLESALE_PRODUCT_LOCKED' using errcode = 'WHL04';
  end if;

  select bp.price, p.sale_type into v_price, v_sale_type
  from public.branch_products bp
  join public.products p on p.id = bp.product_id
  where bp.id = new.branch_product_id;

  if v_sale_type = 'weight' then
    raise exception 'WHOLESALE_WEIGHT_PRODUCT' using errcode = 'WHL02';
  end if;

  -- Solo al crear o cambiar el precio del nivel. Editar el rango de un nivel que quedó
  -- por encima del precio normal (porque este bajó) sigue permitido.
  if (tg_op = 'INSERT' or new.unit_price <> old.unit_price)
     and v_price is not null and new.unit_price >= v_price then
    raise exception 'WHOLESALE_PRICE_NOT_LOWER' using errcode = 'WHL01';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_wholesale_price() from public, anon, authenticated;

create trigger validate_wholesale_price
  before insert or update on public.wholesale_prices
  for each row execute function private.validate_wholesale_price();

-- -----------------------------------------------------------------------------
-- 3. Precios no crecientes: a mayor cantidad, precio igual o menor
-- -----------------------------------------------------------------------------
-- Constraint trigger (después de escribir): ve el conjunto final de niveles. Bloquea la
-- fila de branch_products para serializar escrituras concurrentes del mismo producto:
-- la segunda transacción espera y, al continuar (READ COMMITTED), ve lo que confirmó la
-- primera. Así dos admins no pueden dejar niveles crecientes entre los dos.
create function private.check_wholesale_decreasing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.branch_products bp where bp.id = new.branch_product_id for update;
  if exists (
    select 1
    from public.wholesale_prices lower_tier
    join public.wholesale_prices upper_tier
      on upper_tier.branch_product_id = lower_tier.branch_product_id
     and upper_tier.min_quantity > lower_tier.min_quantity
    where lower_tier.branch_product_id = new.branch_product_id
      and upper_tier.unit_price > lower_tier.unit_price
  ) then
    raise exception 'WHOLESALE_PRICE_INCREASING' using errcode = 'WHL03';
  end if;
  return null;
end;
$$;

revoke all on function private.check_wholesale_decreasing() from public, anon, authenticated;

create constraint trigger wholesale_prices_decreasing
  after insert or update on public.wholesale_prices
  deferrable initially immediate
  for each row execute function private.check_wholesale_decreasing();

-- -----------------------------------------------------------------------------
-- 4. RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.wholesale_prices enable row level security;

-- Público: solo niveles de productos visibles (RLS de branch_products) que hoy aplican
-- (menores al precio normal). Los que «requieren revisión» no se exponen.
create policy "Public can read applicable wholesale prices"
  on public.wholesale_prices for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.branch_products bp
      where bp.id = branch_product_id and wholesale_prices.unit_price < bp.price
    )
  );

create policy "Admins can read wholesale prices" on public.wholesale_prices
  for select to authenticated using ((select private.is_admin()));
create policy "Admins can insert wholesale prices" on public.wholesale_prices
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins can update wholesale prices" on public.wholesale_prices
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete wholesale prices" on public.wholesale_prices
  for delete to authenticated using ((select private.is_admin()));

-- Defensa en profundidad además de RLS: anon solo lee; TRUNCATE para nadie.
revoke all on public.wholesale_prices from public, anon, authenticated;
grant select on public.wholesale_prices to anon, authenticated;
grant insert, update, delete on public.wholesale_prices to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Snapshot histórico en pedidos: qué regla de precio se cobró
-- -----------------------------------------------------------------------------

create type public.pricing_type as enum ('normal', 'promotion', 'wholesale');

-- NULL solo en partidas anteriores a esta migración (no se puede reconstruir el pasado).
-- NOT VALID: la regla obliga a toda partida NUEVA sin reescribir las históricas.
alter table public.order_items add column pricing_type public.pricing_type;
alter table public.order_items
  add constraint order_items_pricing_type_required check (pricing_type is not null) not valid;

comment on column public.order_items.pricing_type is
  'Regla que fijó unit_price al crear el pedido (normal, promotion, wholesale). NULL = pedido anterior al mayoreo.';

-- -----------------------------------------------------------------------------
-- 6. Precio efectivo por cantidad (ÚNICA definición para pedidos)
-- -----------------------------------------------------------------------------
-- Espejo en TypeScript: src/lib/catalog/pricing.ts (resolveUnitPrice); las pruebas de
-- PGlite comparan ambos con la misma matriz de casos.
create function private.line_price(p_branch_product_id uuid, p_quantity numeric)
returns table (unit_price numeric(10, 2), pricing_type public.pricing_type)
language sql
stable
set search_path = ''
as $$
  select
    case
      when wholesale.price is not null and wholesale.price < coalesce(promo.price, bp.price) then wholesale.price
      else coalesce(promo.price, bp.price)
    end,
    case
      when wholesale.price is not null and wholesale.price < coalesce(promo.price, bp.price) then 'wholesale'
      when promo.price is not null then 'promotion'
      else 'normal'
    end::public.pricing_type
  from public.branch_products bp
  join public.products p on p.id = bp.product_id
  -- Promoción vigente más baja, solo si es menor al precio normal (Fase 8D).
  cross join lateral (
    select min(pr.promotional_price) as price
    from public.promotions pr
    where pr.branch_product_id = bp.id
      and pr.is_active
      and (pr.starts_at is null or pr.starts_at <= now())
      and (pr.ends_at is null or pr.ends_at > now())
      and pr.promotional_price < bp.price
  ) as promo
  -- Nivel cuyo rango contiene la cantidad (a lo sumo uno: no hay solapamientos), solo
  -- si es menor al precio normal y el producto se vende por unidad.
  cross join lateral (
    select min(w.unit_price) as price
    from public.wholesale_prices w
    where w.branch_product_id = bp.id
      and p.sale_type = 'unit'
      and w.min_quantity <= p_quantity
      and (w.max_quantity is null or p_quantity <= w.max_quantity)
      and w.unit_price < bp.price
  ) as wholesale
  where bp.id = p_branch_product_id;
$$;

revoke all on function private.line_price(uuid, numeric) from public, anon, authenticated;

-- Partidas con precio ACTUAL por cantidad. Cambia el tipo de retorno (pricing_type):
-- se reemplaza la función de …000400.
drop function private.priced_order_lines(uuid, jsonb);

create function private.priced_order_lines(p_branch_id uuid, p_items jsonb)
returns table (
  product_id uuid,
  product_name text,
  product_presentation text,
  unit_price numeric(10, 2),
  quantity numeric(10, 3),
  subtotal numeric(10, 2),
  pricing_type public.pricing_type
)
language sql
stable
set search_path = ''
as $$
  select
    bp.product_id,
    p.name,
    case
      when p.presentation is null or p.unit is null then null
      else trim_scale(p.presentation)::text || ' ' ||
        case when p.unit = 'pieza' and p.presentation <> 1 then 'piezas' else p.unit::text end
    end,
    priced.unit_price,
    requested.quantity,
    round(priced.unit_price * requested.quantity, 2),
    priced.pricing_type
  from (
    select (element ->> 'product_id')::uuid as product_id,
           (element ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) as element
  ) as requested
  join public.branch_products bp
    on bp.branch_id = p_branch_id and bp.product_id = requested.product_id
  join public.products p on p.id = bp.product_id
  cross join lateral private.line_price(bp.id, requested.quantity) as priced;
$$;

revoke all on function private.priced_order_lines(uuid, jsonb) from public, anon, authenticated;

-- Comprobante: igual que antes + pricing_type por partida (lo que realmente se cobró).
create or replace function private.order_receipt(p_order_id uuid, p_replayed boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', o.id,
    'folio', o.folio,
    'status', o.status,
    'created_at', o.created_at,
    'delivery_type', o.delivery_type,
    'payment_method', o.payment_method,
    -- Montos como texto con 2 decimales para no perder precisión en JSON.
    'subtotal', o.subtotal::text,
    'shipping_cost', o.shipping_cost::text,
    'total', o.total::text,
    'replayed', p_replayed,
    'branch', jsonb_build_object('name', b.name, 'whatsapp_number', b.whatsapp_number),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id', i.product_id,
          'name', i.product_name,
          'presentation', i.product_presentation,
          'unit_price', i.unit_price::text,
          'quantity', trim_scale(i.quantity),
          'subtotal', i.subtotal::text,
          'pricing_type', i.pricing_type
        )
        order by i.product_name, i.product_presentation
      )
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.branches b on b.id = o.branch_id
  where o.id = p_order_id;
$$;

-- -----------------------------------------------------------------------------
-- 7. create_order: misma firma, mismos parámetros (ids, cantidades, checkout). Único
--    cambio: las partidas guardan pricing_type. El precio por cantidad lo decide
--    private.line_price; el navegador no envía precios ni tipo de precio.
-- -----------------------------------------------------------------------------

create or replace function public.create_order(
  p_client_request_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_type public.delivery_type,
  p_payment_method public.payment_method default 'cash',
  p_address text default null,
  p_neighborhood text default null,
  p_address_references text default null,
  p_cash_amount numeric default null,
  p_customer_notes text default null,
  -- Subtotal que el cliente vio. NO se usa para calcular: si difiere del
  -- recalculado se rechaza con PRICE_CHANGED para que el usuario lo revise.
  p_expected_subtotal numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_order_id uuid;
  v_item_count integer;
  v_ids uuid[];
  v_subtotal numeric(10, 2);
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_neighborhood text := nullif(btrim(coalesce(p_neighborhood, '')), '');
  v_references text := nullif(btrim(coalesce(p_address_references, '')), '');
  v_notes text := nullif(btrim(coalesce(p_customer_notes, '')), '');
begin
  -- 1. Idempotencia: el mismo intento devuelve el pedido ya creado.
  if p_client_request_id is null then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"client_request_id"}');
  end if;

  select id into v_order_id from public.orders where client_request_id = p_client_request_id;
  if found then
    return private.order_receipt(v_order_id, true);
  end if;

  -- 2. Carrito: arreglo de 1 a 100 objetos {product_id: uuid, quantity: 1..99}, sin repetidos.
  --    Cualquier otra clave (unit_price, pricing_type, …) se ignora: no se lee nunca.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    perform private.raise_order_error('INVALID_CART');
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count = 0 then
    perform private.raise_order_error('CART_EMPTY');
  end if;
  if v_item_count > 100 then
    perform private.raise_order_error('INVALID_CART', '{"reason":"too_many_items"}');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as element
    where jsonb_typeof(element) <> 'object'
       or jsonb_typeof(element -> 'product_id') is distinct from 'string'
       or lower(element ->> 'product_id') !~ v_uuid_pattern
       or jsonb_typeof(element -> 'quantity') is distinct from 'number'
  ) then
    perform private.raise_order_error('INVALID_CART', '{"reason":"malformed_item"}');
  end if;

  select array_agg((element ->> 'product_id')::uuid) into v_ids
  from jsonb_array_elements(p_items) as element
  where (element ->> 'quantity')::numeric not between 1 and 99
     or (element ->> 'quantity')::numeric <> trunc((element ->> 'quantity')::numeric);
  if v_ids is not null then
    perform private.raise_order_error('INVALID_QUANTITY', jsonb_build_object('product_ids', v_ids));
  end if;

  if (select count(distinct (element ->> 'product_id')::uuid) from jsonb_array_elements(p_items) as element)
     <> v_item_count then
    perform private.raise_order_error('INVALID_CART', '{"reason":"duplicate_product"}');
  end if;

  -- 3. Datos del cliente y entrega (además de los constraints de la tabla).
  if char_length(v_name) not between 2 and 120 then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"customer_name"}');
  end if;
  if v_phone !~ '^[0-9]{10,15}$' then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"customer_phone"}');
  end if;
  if p_delivery_type is null then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"delivery_type"}');
  end if;
  if p_delivery_type = 'delivery' then
    if v_address is null or char_length(v_address) > 300 then
      perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"address"}');
    end if;
    if v_neighborhood is null or char_length(v_neighborhood) > 120 then
      perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"neighborhood"}');
    end if;
    if char_length(v_references) > 300 then
      perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"address_references"}');
    end if;
  else
    -- Recoger en sucursal: no se guarda una dirección que no se usará.
    v_address := null;
    v_neighborhood := null;
    v_references := null;
  end if;
  if p_payment_method is null then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"payment_method"}');
  end if;
  if p_cash_amount is not null and (
    p_payment_method <> 'cash'
    or p_cash_amount <= 0
    or p_cash_amount > 99999.99
    or p_cash_amount <> round(p_cash_amount, 2)
  ) then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"cash_amount"}');
  end if;
  if char_length(v_notes) > 500 then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"customer_notes"}');
  end if;

  -- 4. Sucursal activa.
  if not exists (select 1 from public.branches where id = p_branch_id and is_active) then
    perform private.raise_order_error('BRANCH_UNAVAILABLE');
  end if;

  -- 5. Productos: deben existir en la sucursal y ser visibles en la tienda
  --    (producto, subcategoría y categoría activos). No se descartan en silencio.
  select array_agg(requested.product_id) into v_ids
  from (
    select (element ->> 'product_id')::uuid as product_id from jsonb_array_elements(p_items) as element
  ) as requested
  where not exists (
    select 1
    from public.branch_products bp
    join public.products p on p.id = bp.product_id
    join public.subcategories s on s.id = p.subcategory_id
    join public.categories c on c.id = s.category_id
    where bp.branch_id = p_branch_id
      and bp.product_id = requested.product_id
      and p.is_active and s.is_active and c.is_active
  );
  if v_ids is not null then
    perform private.raise_order_error('PRODUCT_UNAVAILABLE', jsonb_build_object('product_ids', v_ids));
  end if;

  select array_agg(bp.product_id) into v_ids
  from public.branch_products bp
  where bp.branch_id = p_branch_id
    and not bp.is_available
    and bp.product_id in (
      select (element ->> 'product_id')::uuid from jsonb_array_elements(p_items) as element
    );
  if v_ids is not null then
    perform private.raise_order_error('PRODUCT_OUT_OF_STOCK', jsonb_build_object('product_ids', v_ids));
  end if;

  -- 6. Pedido + partidas + historial en esta misma transacción. El folio lo
  --    asigna la sequence (default de orders.folio).
  begin
    insert into public.orders (
      client_request_id, branch_id, customer_name, customer_phone, delivery_type,
      address, neighborhood, address_references, payment_method, cash_amount,
      customer_notes, subtotal, shipping_cost, total
    )
    values (
      p_client_request_id, p_branch_id, v_name, v_phone, p_delivery_type,
      v_address, v_neighborhood, v_references, p_payment_method, p_cash_amount,
      v_notes, 0, null, 0
    )
    returning id into v_order_id;
  exception when unique_violation then
    -- Otro intento simultáneo con el mismo client_request_id ganó la carrera.
    select id into v_order_id from public.orders where client_request_id = p_client_request_id;
    if found then
      return private.order_receipt(v_order_id, true);
    end if;
    raise;
  end;

  -- Precios (normal, promoción y mayoreo por cantidad) leídos una sola vez: los
  -- totales salen de las partidas insertadas.
  insert into public.order_items (
    order_id, product_id, product_name, product_presentation, unit_price, quantity, subtotal, pricing_type
  )
  select v_order_id, l.product_id, l.product_name, l.product_presentation, l.unit_price, l.quantity, l.subtotal, l.pricing_type
  from private.priced_order_lines(p_branch_id, p_items) as l;

  select sum(i.subtotal) into v_subtotal from public.order_items i where i.order_id = v_order_id;

  -- Envío "por confirmar": shipping_cost NULL y total = subtotal (total conocido).
  update public.orders set subtotal = v_subtotal, total = v_subtotal where id = v_order_id;

  if p_expected_subtotal is not null and p_expected_subtotal <> v_subtotal then
    -- Revierte todo lo anterior: el cliente debe revisar los precios actuales.
    perform private.raise_order_error('PRICE_CHANGED', jsonb_build_object('subtotal', v_subtotal::text));
  end if;
  if p_cash_amount is not null and p_cash_amount < v_subtotal then
    perform private.raise_order_error('INVALID_CHECKOUT_DATA', '{"field":"cash_amount","reason":"less_than_subtotal"}');
  end if;

  insert into public.order_status_history (order_id, previous_status, new_status, changed_by)
  values (v_order_id, null, 'new', null);

  return private.order_receipt(v_order_id, false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. admin_save_product: misma firma. Cada elemento de p_branches acepta además
--    "wholesale": [{"id": uuid|null, "min_quantity": 3, "max_quantity": 5|null,
--    "unit_price": "20.00"}, …]. Producto + precio + niveles en UNA transacción.
--    Sin la clave "wholesale" los niveles de esa sucursal no se tocan.
--    Con la clave: los niveles no enviados se borran; los enviados con id se
--    actualizan (solo si cambiaron); los nuevos se insertan.
-- -----------------------------------------------------------------------------

create or replace function public.admin_save_product(
  p_product_id uuid,              -- null = alta
  p_name text,
  p_slug text,
  p_subcategory_id uuid,
  p_brand_id uuid,                -- null = sin marca
  p_presentation numeric,         -- null junto con p_unit = sin presentación
  p_unit public.product_unit,
  p_sale_type public.sale_type,
  p_is_featured boolean,
  p_is_active boolean,
  p_branches jsonb                -- [{"branch_id", "price": "18.50", "is_available", "wholesale"?: […]}, …]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_tier jsonb;
  v_bp uuid;
  v_tier_id uuid;
  v_keep uuid[];
  v_min integer;
  v_max integer;
  v_price numeric(10, 2);
begin
  if not (select private.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_branches is null or jsonb_typeof(p_branches) <> 'array' or jsonb_array_length(p_branches) = 0 then
    raise exception 'BRANCHES_REQUIRED' using errcode = '22023';
  end if;

  -- Validar todas las sucursales y niveles antes de escribir.
  for v_item in select value from jsonb_array_elements(p_branches) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'branch_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or jsonb_typeof(v_item->'price') <> 'string'
       or (v_item->>'price') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
       or jsonb_typeof(v_item->'is_available') <> 'boolean' then
      raise exception 'INVALID_BRANCH_PRICE' using errcode = '22023';
    end if;
    if v_item ? 'wholesale' then
      if jsonb_typeof(v_item->'wholesale') <> 'array' or jsonb_array_length(v_item->'wholesale') > 10 then
        raise exception 'INVALID_WHOLESALE' using errcode = '22023';
      end if;
      if p_sale_type = 'weight' and jsonb_array_length(v_item->'wholesale') > 0 then
        raise exception 'WHOLESALE_WEIGHT_PRODUCT' using errcode = 'WHL02';
      end if;
      for v_tier in select value from jsonb_array_elements(v_item->'wholesale') loop
        if jsonb_typeof(v_tier) <> 'object'
           or (v_tier ? 'id' and jsonb_typeof(v_tier->'id') <> 'null'
               and coalesce(v_tier->>'id', '') !~ '^[0-9a-fA-F-]{36}$')
           or jsonb_typeof(v_tier->'min_quantity') <> 'number'
           or (v_tier->>'min_quantity') !~ '^[0-9]{1,2}$'
           or jsonb_typeof(v_tier->'max_quantity') not in ('number', 'null')
           or (jsonb_typeof(v_tier->'max_quantity') = 'number' and (v_tier->>'max_quantity') !~ '^[0-9]{1,2}$')
           or jsonb_typeof(v_tier->'unit_price') <> 'string'
           or (v_tier->>'unit_price') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
          raise exception 'INVALID_WHOLESALE' using errcode = '22023';
        end if;
      end loop;
    end if;
  end loop;

  -- Varios niveles pueden reacomodarse en un mismo guardado (p. ej. 3–6 y 7+ → 3–5 y
  -- 6+): solapamiento y orden de precios se verifican al final, sobre el estado final.
  set constraints public.wholesale_prices_no_overlap, public.wholesale_prices_decreasing deferred;

  if p_product_id is null then
    insert into public.products
      (name, slug, subcategory_id, brand_id, presentation, unit, sale_type, is_featured, is_active)
    values
      (p_name, p_slug, p_subcategory_id, p_brand_id, p_presentation, p_unit, p_sale_type, p_is_featured, p_is_active)
    returning id into v_id;
  else
    update public.products
       set name = p_name,
           slug = p_slug,
           subcategory_id = p_subcategory_id,
           brand_id = p_brand_id,
           presentation = p_presentation,
           unit = p_unit,
           sale_type = p_sale_type,
           is_featured = p_is_featured,
           is_active = p_is_active
     where id = p_product_id
    returning id into v_id;
    if v_id is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  -- Alta o actualización del precio/disponibilidad en cada sucursal indicada.
  -- No toca promociones: una promoción que deje de ser menor al precio simplemente
  -- deja de aplicarse (misma regla en catálogo y create_order).
  for v_item in select value from jsonb_array_elements(p_branches) loop
    insert into public.branch_products (branch_id, product_id, price, is_available)
    values ((v_item->>'branch_id')::uuid, v_id, (v_item->>'price')::numeric(10, 2), (v_item->>'is_available')::boolean)
    on conflict (branch_id, product_id)
    do update set price = excluded.price, is_available = excluded.is_available
    returning id into v_bp;

    if v_item ? 'wholesale' then
      select coalesce(array_agg((value->>'id')::uuid), '{}')
        into v_keep
      from jsonb_array_elements(v_item->'wholesale')
      where jsonb_typeof(value->'id') = 'string';

      delete from public.wholesale_prices
       where branch_product_id = v_bp and id <> all (v_keep);

      for v_tier in select value from jsonb_array_elements(v_item->'wholesale') loop
        v_min := (v_tier->>'min_quantity')::integer;
        v_max := (v_tier->>'max_quantity')::integer;
        v_price := (v_tier->>'unit_price')::numeric(10, 2);
        v_tier_id := case when jsonb_typeof(v_tier->'id') = 'string' then (v_tier->>'id')::uuid end;

        if v_tier_id is null then
          insert into public.wholesale_prices (branch_product_id, min_quantity, max_quantity, unit_price)
          values (v_bp, v_min, v_max, v_price);
        else
          if not exists (
            select 1 from public.wholesale_prices where id = v_tier_id and branch_product_id = v_bp
          ) then
            -- Lo borró otra sesión o no pertenece a este producto: recargar.
            raise exception 'WHOLESALE_STALE' using errcode = 'WHL05';
          end if;
          -- Solo si cambió: un nivel intacto que quedó por encima de un nuevo precio
          -- normal no bloquea el guardado (queda «Requiere revisión»).
          update public.wholesale_prices
             set min_quantity = v_min, max_quantity = v_max, unit_price = v_price
           where id = v_tier_id
             and (min_quantity, max_quantity, unit_price) is distinct from (v_min, v_max, v_price);
        end if;
      end loop;
    end if;
  end loop;

  -- Verifica ahora (dentro de la función, con errores claros) solapamientos y orden.
  set constraints public.wholesale_prices_no_overlap, public.wholesale_prices_decreasing immediate;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Catálogo: mismas columnas + niveles de mayoreo aplicables (al final de la vista).
--    effective_price NO cambia: sigue siendo el precio de UNA unidad
--    (min(normal, promoción)), que es el que ordena «Precio menor/mayor».
-- -----------------------------------------------------------------------------

create or replace view public.catalog_items
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
  coalesce(promo.promo_price, bp.price) as effective_price,
  -- [{"min": 3, "max": 5, "price": 20.00}, …] por cantidad mínima; null si no hay.
  -- Solo niveles que hoy aplican (menores al precio normal; RLS) de productos por unidad.
  wholesale.tiers as wholesale_tiers
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
) promo on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('min', w.min_quantity, 'max', w.max_quantity, 'price', w.unit_price)
           order by w.min_quantity
         ) as tiers
  from public.wholesale_prices w
  where w.branch_product_id = bp.id
    and p.sale_type = 'unit'
    and w.unit_price < bp.price
) wholesale on true;

comment on view public.catalog_items is
  'Catálogo público por sucursal: precio efectivo para 1 unidad (promoción vigente más baja si es menor) y niveles de mayoreo aplicables. security_invoker: respeta la RLS de quien consulta.';
