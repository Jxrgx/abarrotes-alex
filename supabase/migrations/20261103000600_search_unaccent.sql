-- =============================================================================
-- Abarrotes Alex · Búsqueda sin acentos (Fase 4C)
--
-- La búsqueda completa (/productos?q=) usa ILIKE, que distingue acentos:
-- "jabon" no encontraba "Jabón". Se agrega products.search_name: el nombre en
-- minúsculas y sin acentos, mantenido por PostgreSQL. La aplicación normaliza
-- el término de la misma forma (NFD sin diacríticos + minúsculas).
-- Ver docs/catalog.md.
-- =============================================================================

create extension if not exists unaccent with schema extensions;

-- unaccent() es STABLE porque el diccionario podría cambiar; fijar el
-- diccionario explícitamente lo vuelve determinista y permite usarlo en una
-- columna generada (patrón estándar de PostgreSQL).
create function private.search_normalize(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, value));
$$;

comment on function private.search_normalize(text) is
  'Minúsculas sin acentos para búsqueda ("Jabón" -> "jabon").';

-- Quien inserta o actualiza productos (admin) evalúa la columna generada.
revoke all on function private.search_normalize(text) from public, anon;
grant execute on function private.search_normalize(text) to authenticated, service_role;

alter table public.products
  add column search_name text generated always as (private.search_normalize(name)) stored;

comment on column public.products.search_name is
  'Nombre normalizado para búsqueda (minúsculas, sin acentos). Generado; no se escribe.';
