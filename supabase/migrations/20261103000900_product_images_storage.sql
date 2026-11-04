-- =============================================================================
-- Abarrotes Alex · Fase 8C.2 — Storage de imágenes de producto
-- =============================================================================
-- Bucket PÚBLICO de solo lectura: las fotos de producto son contenido público, se
-- sirven por la URL pública (CDN, caché larga, compatible con next/image) sin URLs
-- firmadas. La lectura pública por URL no pasa por RLS; por eso NO se crea política
-- SELECT para anon (no se puede listar ni enumerar el bucket por la API).
--
-- Escritura (INSERT / UPDATE / DELETE) solo para administradores, con la misma
-- autoridad que el resto del panel: private.is_admin(). Sin service_role.
--
-- Defensa en profundidad en el propio bucket: la aplicación sube SOLO WebP ya
-- optimizado (≤ 1200 px), así que el bucket rechaza cualquier otro tipo y > 2 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Solo bajo products/<uuid>/… (estructura controlada por la aplicación).
create policy "Admins can upload product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'products'
    and (select private.is_admin())
  );

-- SELECT administrativo: Storage lo necesita para reemplazar y borrar objetos.
create policy "Admins can read product image objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()));

create policy "Admins can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()))
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'products'
    and (select private.is_admin())
  );

create policy "Admins can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()));
