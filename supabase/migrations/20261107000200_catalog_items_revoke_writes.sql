-- =============================================================================
-- Defensa en profundidad para public.catalog_items (migración …20261107000100).
--
-- Supabase otorga por defecto todos los privilegios de las relaciones nuevas del esquema
-- public a anon y authenticated. La vista no es actualizable (une varias tablas y no
-- tiene triggers), así que ninguna escritura prosperaba; aun así se revocan
-- explícitamente los privilegios de ESCRITURA. Se conserva SELECT, que el catálogo
-- público necesita. No cambia ninguna otra política, vista, tabla ni dato.
-- =============================================================================

revoke insert, update, delete, truncate on public.catalog_items from anon, authenticated;
