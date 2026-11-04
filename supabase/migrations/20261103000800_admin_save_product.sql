-- =============================================================================
-- Abarrotes Alex · Fase 8C.1 — Guardado atómico de producto + precios por sucursal
-- =============================================================================
-- Crear/editar un producto toca dos tablas: products y branch_products (precio y
-- disponibilidad por sucursal). Hacerlo con dos llamadas a la API podría dejar un
-- producto sin precio si la segunda falla. Esta función hace ambas cosas en UNA
-- llamada = una transacción: si algo falla, no se guarda nada.
--
-- Seguridad:
--   - SECURITY INVOKER: corre con los permisos y la RLS de quien la llama (las
--     políticas administrativas de products/branch_products ya existen). No usa
--     service_role ni salta RLS.
--   - Rechaza explícitamente a quien no es admin (FORBIDDEN), incluido employee.
--   - EXECUTE solo para authenticated (revocado a public/anon).
--   - No borra: ni productos ni branch_products (no quita sucursales).
--
-- Precios como TEXTO ("18.50") para no pasar por punto flotante; se validan con
-- formato estricto antes de convertir a numeric(10,2).

create function public.admin_save_product(
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
  p_branches jsonb                -- [{"branch_id": uuid, "price": "18.50", "is_available": true}, …]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_item jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_branches is null or jsonb_typeof(p_branches) <> 'array' or jsonb_array_length(p_branches) = 0 then
    raise exception 'BRANCHES_REQUIRED' using errcode = '22023';
  end if;

  -- Validar todas las sucursales antes de escribir.
  for v_item in select value from jsonb_array_elements(p_branches) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'branch_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or jsonb_typeof(v_item->'price') <> 'string'
       or (v_item->>'price') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
       or jsonb_typeof(v_item->'is_available') <> 'boolean' then
      raise exception 'INVALID_BRANCH_PRICE' using errcode = '22023';
    end if;
  end loop;

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
    do update set price = excluded.price, is_available = excluded.is_available;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.admin_save_product(uuid, text, text, uuid, uuid, numeric, public.product_unit, public.sale_type, boolean, boolean, jsonb)
  from public, anon;
grant execute on function public.admin_save_product(uuid, text, text, uuid, uuid, numeric, public.product_unit, public.sale_type, boolean, boolean, jsonb)
  to authenticated;
