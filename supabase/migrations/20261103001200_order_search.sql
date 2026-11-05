-- =============================================================================
-- Abarrotes Alex · Fase 8E — Búsqueda de pedidos sin acentos (conservando la ñ)
-- =============================================================================
-- El panel busca pedidos por nombre del cliente sin exigir acentos:
-- "Maria" encuentra "María", "Angel" encuentra "Ángel", "MARTIN" encuentra "Martín".
--
-- NO se reutiliza private.search_normalize (unaccent) del catálogo: el diccionario de
-- unaccent también convierte ñ → n ("Peña" → "pena", verificado en Supabase). En
-- español ñ es otra letra, así que aquí solo se quitan acentos y diéresis de las
-- vocales (á à â ä é … ü) y se pasa a minúsculas; la ñ se conserva.
--
-- translate() incluye también las mayúsculas acentuadas y Ñ → ñ para no depender de
-- cómo lower() trate caracteres no ASCII según la configuración regional de la base.
-- Espejo en TypeScript: normalizeOrderSearch() (src/lib/admin/order-filters.ts).

create function private.order_search_normalize(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select translate(
    lower(value),
    'áàâäéèêëíìîïóòôöúùûüÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑ',
    'aaaaeeeeiiiioooouuuuaaaaeeeeiiiioooouuuuñ'
  );
$$;

comment on function private.order_search_normalize(text) is
  'Minúsculas sin acentos ni diéresis en vocales, conservando la ñ ("María Peña" -> "maria peña").';

revoke all on function private.order_search_normalize(text) from public, anon;
grant execute on function private.order_search_normalize(text) to authenticated, service_role;

-- Columna generada (mismo patrón que products.search_name): se calcula sola al crear el
-- pedido (create_order no cambia) y para los pedidos existentes.
alter table public.orders
  add column customer_name_search text generated always as (private.order_search_normalize(customer_name)) stored;

comment on column public.orders.customer_name_search is
  'Nombre del cliente normalizado para búsqueda administrativa. Generado; no se escribe.';
