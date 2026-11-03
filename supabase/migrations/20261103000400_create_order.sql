-- =============================================================================
-- Abarrotes Alex · Creación segura de pedidos (Fase 6A)
--
-- public.create_order(...) es la ÚNICA vía para crear pedidos desde la tienda.
-- - SECURITY DEFINER: escribe en orders/order_items/order_status_history sin
--   abrir INSERT público; las tablas siguen sin políticas para anon.
-- - Recalcula TODO en PostgreSQL (sucursal, producto, disponibilidad, precio,
--   promoción, subtotales, total). Del navegador solo usa ids, cantidades y los
--   datos del cliente, que valida aquí mismo.
-- - Una función = una transacción: o se crea el pedido completo o nada.
-- - Idempotente por client_request_id (doble clic / reintento de red).
-- Ver docs/orders.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Idempotencia: un id por intento de pedido generado por el cliente.
-- NULL permitido para pedidos que no vengan del checkout (p. ej. admin futuro).
-- -----------------------------------------------------------------------------

alter table public.orders add column client_request_id uuid;
alter table public.orders
  add constraint orders_client_request_id_key unique (client_request_id);

comment on column public.orders.client_request_id is
  'Id del intento de pedido generado por el cliente. Reenviar el mismo id devuelve el pedido existente.';

-- -----------------------------------------------------------------------------
-- Esquema privado para funciones auxiliares (no expuesto por la API).
-- -----------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;

-- Error de negocio con código estable en MESSAGE y contexto JSON en DETAIL.
create function private.raise_order_error(p_code text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail = coalesce(p_detail, '{}'::jsonb)::text;
end;
$$;

-- Partidas con precio ACTUAL de la sucursal. Precio efectivo = promoción vigente
-- de menor precio (si es menor al precio normal); si no, el precio normal.
-- Misma regla que el catálogo (RLS de promotions + bestPromoPrice).
create function private.priced_order_lines(p_branch_id uuid, p_items jsonb)
returns table (
  product_id uuid,
  product_name text,
  product_presentation text,
  unit_price numeric(10, 2),
  quantity numeric(10, 3),
  subtotal numeric(10, 2)
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
    effective.price,
    requested.quantity,
    round(effective.price * requested.quantity, 2)
  from (
    select (element ->> 'product_id')::uuid as product_id,
           (element ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) as element
  ) as requested
  join public.branch_products bp
    on bp.branch_id = p_branch_id and bp.product_id = requested.product_id
  join public.products p on p.id = bp.product_id
  cross join lateral (
    select coalesce(
      (
        select min(pr.promotional_price)
        from public.promotions pr
        where pr.branch_product_id = bp.id
          and pr.is_active
          and (pr.starts_at is null or pr.starts_at <= now())
          and (pr.ends_at is null or pr.ends_at > now())
          and pr.promotional_price < bp.price
      ),
      bp.price
    ) as price
  ) as effective;
$$;

-- Comprobante devuelto al cliente: solo lo necesario para la confirmación y el
-- mensaje de WhatsApp. No incluye nombre, teléfono ni dirección del cliente.
create function private.order_receipt(p_order_id uuid, p_replayed boolean)
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
          'subtotal', i.subtotal::text
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

revoke all on all functions in schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_order
-- -----------------------------------------------------------------------------

create function public.create_order(
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

  -- Precios leídos una sola vez: los totales salen de las partidas insertadas.
  insert into public.order_items (
    order_id, product_id, product_name, product_presentation, unit_price, quantity, subtotal
  )
  select v_order_id, l.product_id, l.product_name, l.product_presentation, l.unit_price, l.quantity, l.subtotal
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

comment on function public.create_order is
  'Crea un pedido anónimo de forma atómica recalculando precios en la base. Ver docs/orders.md.';

-- Solo esta operación queda expuesta; las tablas siguen sin INSERT público.
revoke all on function public.create_order(
  uuid, uuid, jsonb, text, text, public.delivery_type, public.payment_method,
  text, text, text, numeric, text, numeric
) from public;
grant execute on function public.create_order(
  uuid, uuid, jsonb, text, text, public.delivery_type, public.payment_method,
  text, text, text, numeric, text, numeric
) to anon, authenticated, service_role;
