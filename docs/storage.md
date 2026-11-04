# Storage — imágenes de producto (Fase 8C.2)

Fotos de producto en Supabase Storage. Migración `20261103000900_product_images_storage.sql`.

## Bucket `product-images`

| Propiedad | Valor | Motivo |
| --- | --- | --- |
| Público | **Sí** (solo lectura) | Las fotos son contenido público: URL pública cacheable por CDN, compatible con `next/image`, sin URLs firmadas. |
| `allowed_mime_types` | `image/webp` | La aplicación solo sube WebP ya procesado; el bucket rechaza todo lo demás (defensa en profundidad). |
| `file_size_limit` | 2 MB | Un WebP de ≤ 1200 px nunca se acerca; bloquea subidas crudas. |

### Políticas (`storage.objects`)

| Operación | Quién | Condición |
| --- | --- | --- |
| Lectura pública | Cualquiera | Por la **URL pública** (`/storage/v1/object/public/product-images/…`), que no pasa por RLS. |
| SELECT por API | Solo admin | Necesario para reemplazar/borrar. anon y no-admin **no** pueden listar ni enumerar el bucket. |
| INSERT | Solo admin | `bucket_id = 'product-images'`, primera carpeta `products`, `private.is_admin()`. |
| UPDATE | Solo admin | Igual; no se puede mover un objeto fuera de `products/`. |
| DELETE | Solo admin | `bucket_id = 'product-images'` y `private.is_admin()`. |

Misma autoridad que el resto del panel (`profiles.role = 'admin'`). employee, usuarios
sin profile y anon no escriben. **Nunca `service_role`**: el servidor sube con la sesión del admin.

## Paths versionados

```
products/{productId}/{uuid}.webp
```

- El path lo genera la aplicación; **nunca** se usa el nombre original del archivo.
- Cada versión tiene su propio path (uuid): se puede cachear un año (`cacheControl:
  31536000`) sin riesgo de servir una foto vieja tras reemplazarla.
- `products.image_path` guarda solo el object path (el CHECK rechaza URLs completas y `/`
  inicial). La URL pública se construye **solo** en `productImageUrl()`
  (`src/lib/catalog/images.ts`) y la usan todos vía `ProductImage`: tienda, admin,
  búsqueda instantánea y carrito. Checkout no muestra imágenes; WhatsApp no incluye URLs.
- La carpeta por producto facilita limpieza e imágenes adicionales en el futuro.

## Procesamiento (servidor, `sharp` 0.35.5)

`sharp` ya venía como dependencia opcional de Next.js (lo usa la optimización de
`next/image`); se declaró explícitamente en `package.json` con la misma versión.

1. **Navegador** (UX): JPG/PNG/WebP, máx. 10 MB, vista previa local con
   `URL.createObjectURL` (se libera al cambiar/cerrar). No sube nada al seleccionar.
2. **Servidor** (autoridad, Server Action `saveProduct`): `requireAdmin()` → repite tipo y
   tamaño → **decodifica** con sharp (`failOn: "error"`) y exige que el formato real sea
   JPEG, PNG o WebP (un `.exe` renombrado a `.jpg`, un archivo truncado o un GIF con MIME
   `image/png` se rechazan) → `rotate()` (orientación EXIF) → `resize` a ≤ 1200×1200
   (`fit: inside`, sin agrandar, sin recortes, conserva transparencia) → WebP calidad 82.
   sharp no copia metadatos: se eliminan EXIF/GPS.
- **HEIC/HEIF no se acepta**: el binario de sharp solo decodifica AVIF por libheif (sin
  HEVC). Mensaje: "Usa una imagen JPG, PNG o WebP." Un iPhone ya exporta JPEG al compartir.
- Límites de cuerpo (`next.config.ts`): `experimental.serverActions.bodySizeLimit` y
  `experimental.proxyClientMaxBodySize` = 11 MB (10 MB + overhead multipart; `/admin` pasa
  por `proxy.ts`). La acción exige admin antes de procesar.

## Flujo y compensación (PostgreSQL + Storage no comparten transacción)

La imagen se valida y procesa **antes** de guardar nada: un archivo inválido no deja
producto ni objeto. Después:

```
admin_save_product (producto + precios, su propia transacción; no se modificó)
  → imagen nueva:  subir products/{id}/{uuid}.webp → UPDATE image_path → borrar la anterior
  → eliminar:      UPDATE image_path = NULL → borrar el objeto
```

| Falla | Resultado |
| --- | --- |
| Subida | La BD no cambia: sigue la imagen anterior (o el placeholder). |
| `UPDATE image_path` | Se borra el objeto recién subido (compensación); sigue la anterior. |
| Borrar la anterior / la eliminada | Queda un **objeto huérfano** (se registra solo el código, sin detalles). La BD nunca apunta a un objeto borrado. |
| Imagen en un producto nuevo | El producto y su precio **se conservan** con placeholder; el admin ve "El producto se guardó, pero la imagen no. …" y puede reintentar editando. |

Solo se borran objetos con el formato de la aplicación (`products/{id}/{uuid}.webp` del
mismo producto); nunca paths ajenos. El UPDATE de `image_path` usa la política
administrativa existente de `products` (no hizo falta una función nueva).

**CDN**: tras borrar un objeto, su URL pública puede seguir respondiendo desde la caché
del CDN de Supabase durante ~1 minuto (verificado: 200 `HIT` → 400 a los ~60 s). No
afecta a la tienda: `image_path` ya apunta a la nueva versión (o es NULL) desde el
momento del guardado, y cada versión tiene su propio path.

**Borrado solo por la API de Storage**: Supabase prohíbe `DELETE` directo en
`storage.objects` por SQL (`42501`, incluso para admin); la app borra con
`storage.from('product-images').remove()`, que aplica la política de DELETE.

## Visualización

- `next/image` solo acepta el host exacto del proyecto y el path
  `/storage/v1/object/public/product-images/**` (`next.config.ts`).
- `ProductImage` muestra el placeholder si `image_path` es NULL **o** si la imagen no carga
  (sin íconos rotos).
- La búsqueda instantánea mantiene su caché de 60 s en el navegador.

## Pendiente

- Limpieza periódica de objetos huérfanos (comparar `storage.objects` con `products.image_path`).
- Varias imágenes por producto (la carpeta por producto ya lo permite).
