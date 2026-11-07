# Preparación de producción (Fase 9C)

Inventario del entorno actual, datos pendientes del cliente, plan de limpieza y checklist de
lanzamiento. **9C.1 es solo auditoría y planificación**: nada de lo descrito aquí se ha
ejecutado. Sin secretos ni datos personales: los conteos y estados se obtuvieron con
consultas de solo lectura (`supabase db query --remote --read-only`) el 2026-11-05.

Decisiones vigentes: multisucursal fuera del MVP; `create_order` pública, sin rate limiting
ni CAPTCHA (riesgos aceptados, ver [security.md](security.md) §0).

### Estado de datos del negocio (actualizado en 9C.2, 2026-11-05)

| Dato | Estado |
| --- | --- |
| Nombre comercial | **Confirmado**: Abarrotes Alex (sucursal: "Abarrotes Alex - Concepción Durán") |
| Dirección | **Confirmada** y aplicada en la base |
| Teléfono público | **Confirmado** (984 471 0604) y aplicado |
| WhatsApp de pedidos | **Confirmado** (+52 1 982 104 1154 → `529821041154`) y aplicado |
| Logo | **Confirmado**: logo real integrado (§17) |
| Horarios | **Temporalmente conservados** (los del seed); pendiente confirmación final |
| Dominio | Pendiente |
| Catálogo | **Vacío** desde la limpieza definitiva (2026-11-06). Carga **manual** desde el panel por el cliente; se esperan +1,000 productos |
| Hosting | Vercel (`https://abarrotes-alex.vercel.app`) |

### Estado limpio actual (limpieza definitiva, 2026-11-06)

Ejecutada con autorización explícita, en **una sola transacción** con guardas previas (sin
PII: id fijo de la sucursal, conteos auditados y huellas md5 de lo que se conserva). Un
fallo en cualquier guarda o verificación revertía todo. Antes se probó en PGlite (incluido
el aborto atómico) y se evaluaron las guardas en remoto en modo solo lectura.

| Tabla | Antes | Después |
| --- | --- | --- |
| `branches` | 1 | **1** (sin cambios, huella verificada) |
| `branch_hours` | 7 | **7** (sin cambios, huella verificada) |
| `categories` / `subcategories` / `brands` | 6 / 13 / 8 | 0 / 0 / 0 |
| `products` / `branch_products` / `promotions` | 14 / 14 / 3 | 0 / 0 / 0 |
| `orders` / `order_items` / `order_status_history` | 17 / 28 / 36 | 0 / 0 / 0 |
| `private.order_push_events` | 13 | 0 (CASCADE desde `orders`) |
| `profiles` / `auth.users` | 2 / 2 | **2 / 2** (admins: desarrollo + Alexander) |
| `push_subscriptions` | 1 | **1** (dispositivo del panel, sin cambios) |
| `private.app_secrets` | 1 | **1** (hash del secreto de despacho, sin cambios) |
| `storage.objects` (`product-images`) | 2 | 0 (borradas con la Storage API y sesión admin) |
| Migraciones | 15 | **15** |
| `order_folio_seq` | `last_value 17`, `is_called true` | `last_value 1`, `is_called false` → el siguiente pedido será **ALEX-000001** (verificado sin `nextval`) |

Sin cambios: bucket `product-images` (público) y sus 4 políticas, trigger
`protect_objects_delete`, vistas, funciones, triggers, RLS/políticas y configuración de
Realtime/Push. `realtime.messages` no se limpió: Realtime lo purga solo y solo contiene
`{order_id, folio}`.

- **Backup previo**: lógico (JSON por tabla + metadatos de Storage + las 2 imágenes + estado
  de la secuencia), en una carpeta local del equipo de desarrollo, **fuera** del repositorio
  y de carpetas sincronizadas. Contiene datos personales: no se versiona ni se sube; borrarlo
  cuando ya no haga falta.
- **QA posterior en producción (solo lectura)**: inicio, `/productos`, búsqueda, página fuera
  de rango y carrito muestran estados vacíos amigables. El panel muestra dashboard en cero,
  «Aún no hay…» en pedidos, productos, categorías, marcas y promociones, y en subcategorías
  pide primero crear una categoría. La tarjeta de notificaciones y los manifiestos PWA
  (`/tienda.webmanifest`, `/admin.webmanifest`, `/sw.js`) responden bien. No se enviaron
  push ni se crearon datos.
- **Siguiente paso (cliente, desde el panel)**: Categorías → Subcategorías → Marcas →
  Productos → Imágenes → Promociones.
- Pendientes que no cambian: eliminar la cuenta admin de desarrollo (§10),
  `SEARCH_INDEXING_ENABLED` sigue en `false`, y los horarios son los del seed.

Las secciones §1–§5 y §19–§20 describen el estado **anterior** a esta limpieza y quedan como
referencia histórica.

---

## 1. Inventario de 9C.1 (histórico, 2026-11-05; ver «Estado limpio actual»)

| Tabla | Filas | Detalle |
| --- | --- | --- |
| `branches` | 1 | Mismo id fijo del seed. Desde 9C.2 con nombre, dirección, teléfono y WhatsApp **reales** (coordenadas del seed puestas en `NULL`). Activa |
| `branch_hours` | 7 | Horario del seed: L–S 08:00–21:00, D 09:00–15:00 |
| `categories` | 6 | 5 del seed (activas) + 1 `__E2E__` (inactiva) |
| `subcategories` | 13 | 11 del seed + 1 `__E2E__` + 1 **«Galletas» bajo Botanas** (ver §2) — las 2 últimas inactivas |
| `brands` | 8 | 7 del seed (ficticias) + 1 `__E2E__` (inactiva) |
| `products` | 13 | 12 del seed + 1 `__E2E__` (inactivo). **Ninguno tiene imagen** |
| `branch_products` | 13 | Precios del seed; 11 disponibles (agotados: «Jugo de mango» del seed y el `__E2E__`) |
| `promotions` | 2 | Ambas del seed: Refresco de cola 600 ml (sin fechas) y Detergente (vence 2026-12-03) |
| `orders` | 3 | ALEX-000001, -000002, -000003 (ver §3) |
| `order_items` | 8 | Solo de esos 3 pedidos |
| `order_status_history` | 8 | 1 + 1 + 6 |
| `profiles` | 1 | 1 admin (cuenta de **desarrollo**) |
| `auth.users` | 1 | La misma cuenta |
| `storage.objects` (`product-images`) | 0 | Bucket configurado: público, solo `image/webp`, 2 MB |

Las 12 migraciones (`…000100` a `…001200`) están aplicadas y registradas.

## 2. Datos `__E2E__` y otros datos de prueba

| Tipo | Nombre identificable | Estado | Relaciones |
| --- | --- | --- | --- |
| Categoría | `__E2E__ Categoria e2e-pmwfp editada` | inactiva | 1 subcategoría (la E2E) |
| Subcategoría | `__E2E__ Subcategoria e2e-pmwfp editada` | inactiva | 1 producto (el E2E) |
| Marca | `__E2E__ Marca e2e-pmwfp editada` | inactiva | 1 producto (el E2E) |
| Producto | `__E2E__ Producto e2e-pmwfp` | inactivo, agotado, no destacado, sin imagen | 1 `branch_products`; 0 promociones; 0 partidas de pedido |
| Pedido | ALEX-000003 (cliente `__E2E__ Cliente estados`) | `delivered` | 1 partida (producto del seed), 6 historial |
| Subcategoría **sin prefijo** | «Galletas» dentro de **Botanas** | inactiva, 0 productos | Creada el 2026-11-04 durante pruebas del panel; **no** está en el seed. Confirmar y eliminar con la limpieza |

No hay promociones, imágenes ni objetos de Storage `__E2E__` (las promociones E2E ya se
borraron con `test:e2e:cleanup`).

## 3. Pedidos de desarrollo

| Folio | Estado | Origen | Dependencias |
| --- | --- | --- | --- |
| ALEX-000001 | `new` | Desarrollo (2026-11-03, sobre el catálogo ficticio, antes de existir la tienda pública) | 4 partidas, 1 historial |
| ALEX-000002 | `new` | Desarrollo (ídem) | 3 partidas, 1 historial |
| ALEX-000003 | `delivered` | E2E autorizado (Fase 8E) | 1 partida, 6 historial |

Los tres son de desarrollo: se compraron productos que no existen. Sus dependencias son
normales (`order_items` y `order_status_history` con `ON DELETE CASCADE`). ALEX-000001/2 pueden
contener datos personales reales de quien probó: no deben quedar en producción.

## 4. Sequence de folios

`public.order_folio_seq`: `last_value = 3`, `is_called = true` (el siguiente sería
ALEX-000004). Inicio 1, incremento 1.

**Recomendación: el primer pedido real debe ser ALEX-000001.** El folio se muestra al
cliente y al personal; empezar en 000004 sugiere pedidos que nunca existieron y complica
la conciliación. Es seguro porque, tras la limpieza, `orders` queda vacía (sin colisiones con
el `unique` del folio) y la idempotencia usa `client_request_id`, no el folio.

Cómo (en 9C.2, en la misma transacción que borra los pedidos, solo si `orders` quedó vacía):
`alter sequence public.order_folio_seq restart with 1;`. Después del go-live **nunca** se
reinicia.

Efecto colateral menor: un navegador de desarrollo que guarde en `sessionStorage` el
comprobante de un ALEX-00000X antiguo seguiría mostrándolo en esa pestaña; no afecta a
clientes.

## 5. Catálogo semilla

Todo el catálogo activo proviene de [`supabase/seed.sql`](../supabase/seed.sql), que se declara
"Datos ficticios… No usar en producción":

- **Categorías (5)**: Lácteos, Botanas, Limpieza, Bebidas, Galletas — nombres genéricos que
  **podrían reutilizarse** si el cliente los confirma (renombrar/reordenar desde el panel).
- **Subcategorías (11)**: Leche, Yogur, Papas, Cacahuates, Detergentes, Lavatrastes,
  Refrescos, Agua, Jugos, Dulces, Saladas — igual: reutilizables solo si encajan.
- **Marcas (7)**: Rancho Lindo, Crujis, Brillex, Doña Galleta, Burbuja, Manantial Claro,
  Fruta Viva — **inventadas**: se retiran.
- **Productos (12)**, **precios** y **disponibilidad**: inventados — se retiran.
- **Promociones (2)**: de demostración — se retiran.

Restricción técnica: `order_items.product_id` es `ON DELETE RESTRICT`. Los productos del seed
referenciados por los pedidos de desarrollo solo se pueden borrar **después** de borrar esos
pedidos.

## 6. Sucursal

Actualizada en 9C.2 con un `UPDATE` explícito sobre la fila existente (mismo id; autorizado
por el usuario), con guarda sobre los valores del seed. Verificado después: 1 sucursal, 7
horarios sin cambios, 13 `branch_products` y 3 pedidos asociados, catálogo y pedidos sin
cambios (huellas md5 idénticas antes/después).

| Campo | Estado | Uso en el sistema |
| --- | --- | --- |
| `name` | **Confirmado**: "Abarrotes Alex - Concepción Durán" | Header ("Comprando en Concepción Durán"), footer, comprobante y WhatsApp |
| `address` | **Confirmada**: Calle 24 #18, Concepción Durán, 24400 Champotón, Campeche | Inicio, footer, mensaje de recoger en tienda |
| `phone` | **Confirmado**: `9844710604` (se muestra "984 471 0604") | Enlace `tel:` en inicio y footer |
| `whatsapp_number` | **Confirmado**: `529821041154` | **Destino de los pedidos por WhatsApp** (crítico) |
| `latitude` / `longitude` | `NULL` (eran del seed) | Hoy no se usan; capturarlas si se agregan mapas |
| `branch_hours` (7 días) | **Temporalmente conservados** (seed) | Inicio («Horario»), estado abierto/cerrado |
| `is_active` | Activa | Debe seguir activa |

Formatos:
- **Teléfono público** y **WhatsApp de pedidos** son números distintos.
- `phone` se guarda con 10 dígitos; `formatPhone` (`src/lib/format.ts`) lo agrupa según la
  LADA: 3-3-4 en general, 2-4-4 para 55/33/81.
- `whatsapp_number` va solo con dígitos, en formato internacional sin "+", como exige el
  `check` del esquema. El "+52 1 982 104 1154" proporcionado se normalizó a 52 + 10 dígitos:
  el "1" de móviles dejó de usarse en México y `wa.me/52…` es el formato actual.
- El número no está en el código: `create_order` lo lee de `branches` en cada pedido.

Multisucursal sigue fuera del MVP.

## 7. Información que hay que pedir al dueño

Solo lo que el sistema usa.

**Negocio**
- ~~Nombre, dirección, WhatsApp de pedidos, teléfono~~: confirmados en 9C.2 (§6).
- Horario por día de la semana (apertura, cierre o cerrado): **pendiente** (se conserva el del seed).
- Si hace entregas a domicilio y cómo comunica el costo de envío (el sistema muestra "envío por confirmar").

**Catálogo** (plantilla de hoja de cálculo, ver §8)
- Categorías y subcategorías (pasillos) en el orden deseado.
- Marcas (opcionales por producto).
- Por producto: nombre, categoría/subcategoría, marca (o "sin marca"), presentación
  (cantidad + unidad: ml, L, g, kg, pieza; o vacío), venta por unidad o a granel (kg),
  precio, disponible/agotado, destacado sí/no.

**Imágenes**
- Foto de cada producto (ver §9); al menos de los destacados para el lanzamiento.

**Promociones** (si existen al lanzar)
- Producto, precio promocional, fecha/hora de inicio y fin (o "hasta nuevo aviso").

**Admin**
- Nombre a mostrar en el panel.
- Correo administrativo propio del negocio (para iniciar sesión y, más adelante, recuperar contraseña).

**Branding** (ver §17)
- ~~Logo~~: recibido e integrado en 9C.2. Opcional: SVG original si existe.

**Dominio**
- Si ya tiene dominio (y quién lo administra) o cuál desea registrar.

## 8. Estrategia de carga del catálogo inicial (100–500 productos)

> **Decisión del cliente (2026-11-07): carga MANUAL desde el panel.** No se implementa
> importador Excel/CSV. El catálogo puede superar 1000 productos: la tienda ya busca,
> ordena y pagina en la base (24 por página; ver [catalog.md](catalog.md)). Lo que sigue
> en esta sección queda como referencia histórica de la evaluación.

**Recomendación original: D) combinación — hoja de cálculo (CSV) + importación controlada por script,
y el panel para correcciones y altas posteriores.**

- **A) Panel uno por uno**: viable para < 50 productos; para 300 son horas de captura y
  errores. Se usa después del lanzamiento.
- **B/C) CSV + script**: el cliente (o nosotros con él) llena una plantilla en Google
  Sheets/Excel; un script versionado (futuro, **no implementado**) la valida y la carga.

Diseño propuesto para el importador (fase futura):
- Plantilla con columnas: `categoria`, `subcategoria`, `marca`, `nombre`, `presentacion`,
  `unidad`, `tipo_venta`, `precio`, `disponible`, `destacado`.
- **Validación completa antes de escribir** (modo ensayo): mismos límites y reglas que el
  panel (`product-forms`), slugs únicos, precios > 0, unidades válidas; reporte de errores
  por fila.
- Escritura en **una transacción** y por la misma ruta de negocio que el panel
  (`admin_save_product`), con sesión de admin (sin `service_role`); idempotente por `slug`.
- Productos cargados como **inactivos** para revisión; activación en bloque tras validar en
  la tienda (ver §19).
- Imágenes fuera del CSV (§9).

## 9. Imágenes

- Los productos pueden publicarse con el **placeholder** (ya probado en toda la tienda).
- Flujo inicial: el admin sube fotos **una por una desde el panel** (el flujo existente
  convierte a WebP, valida y protege contra imágenes enormes), priorizando destacados y más
  vendidos.
- Recomendaciones al cliente: fondo claro y liso, producto centrado, formato cuadrado,
  JPG/PNG/WebP de hasta 10 MB (el sistema las reduce).
- Carga masiva: **no implementada**; considerarla solo si el volumen lo justifica.

## 10. Cuenta admin del cliente (procedimiento futuro, 9C.2)

1. Crear el usuario en **Supabase → Authentication → Users → Add user** con el correo del
   cliente (registro público sigue desactivado). Contraseña temporal entregada por canal
   seguro, o invitación por correo si ya hay SMTP.
2. Crear su `profiles` con `role = 'admin'` y `full_name` (SQL editor):
   `insert into public.profiles (id, full_name, role) values ('<id del usuario>', '<nombre>', 'admin');`
3. Validar: login en `/admin/login`, ver dashboard, pedidos y catálogo.
4. Eliminar la cuenta de desarrollo (Authentication → Users → Delete; su `profiles` se borra
   en cascada y el historial de pedidos conserva `changed_by = null`), o al menos
   deshabilitarla si se quiere mantener un tiempo.
5. Confirmar que `ADMIN_TEST_EMAIL` / `ADMIN_TEST_PASSWORD` no existen en el entorno de
   producción (nunca deben ir a Vercel).

## 11. Credenciales E2E

- `ADMIN_TEST_EMAIL` / `ADMIN_TEST_PASSWORD` viven solo en `.env.local`, ignorado por git
  (`.gitignore: .env*`) y nunca commiteado. `.env.example` (versionado) solo tiene los
  nombres, sin valores.
- Solo las leen los scripts de `tests/e2e`; ningún código de la app las usa.
- En producción **no deben existir**. Tras eliminar la cuenta de desarrollo, las suites
  autenticadas dejan de poder ejecutarse contra producción (es lo deseado).

## 12. Auth en producción (verificado por la API pública de settings)

- [x] Registro público **desactivado** (`disable_signup: true`).
- [x] Email/password activo; teléfono, anónimos, OAuth y SAML desactivados.
- [ ] Admin real (pendiente, §10).
- [ ] Recuperación de contraseña: **no implementada** en la app. Mientras tanto, el
  restablecimiento se hace desde el dashboard de Supabase. Para implementarla hacen falta
  Site URL, Redirect URLs, plantilla de correo y SMTP propio ([security.md](security.md) §7).
- [ ] SMTP propio: necesario si se implementa recuperación o invitaciones por correo.

## 13. Variables de entorno

| Variable | Tipo | Vercel (Production) | Local | Notas |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | PUBLIC | Sí | Sí | Se incrusta en el build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC | Sí | Sí | Llave publishable/anon (pública por diseño) |
| `ADMIN_TEST_EMAIL` | TEST-ONLY | **No** | Sí (`.env.local`) | Solo E2E |
| `ADMIN_TEST_PASSWORD` | TEST-ONLY | **No** | Sí (`.env.local`) | Solo E2E |
| `E2E_BASE_URL` | TEST-ONLY | No | Opcional | URL objetivo de las suites |
| `CHROME_PATH` | TEST-ONLY | No | Opcional | Chrome para puppeteer |
| `QA_FAULT_FILE` | TEST-ONLY | **No** | Opcional | Inyección de fallos (`test:e2e:states`) |
| `NODE_OPTIONS` con `fault-injection.mjs` | TEST-ONLY | **Nunca** | Solo instancia de QA | |
| `NODE_ENV` | — | La pone la plataforma | — | No definir a mano |

Hoy **no hay variables SERVER (secretas)**: la app no usa `service_role` ni secret keys.

En Vercel, las dos `NEXT_PUBLIC_*` se asignan **solo a Production** (no a Preview ni a
Development; ver §14). Se incrustan en el build, así que cualquier cambio requiere
*Redeploy*. Ninguna variable `TEST-ONLY` va a Vercel.

## 14. Vercel (Fase 9D: preproducción)

Flujo estándar de Next.js en Vercel, que es un adaptador verificado de Next 16: SSR, PPR,
Server Actions, Route Handlers y `proxy.ts`. **Sin `vercel.json`**: todo lo necesario se
resuelve con las convenciones de Next y los valores por defecto de Vercel. Netlify no se
prepara.

| Ajuste | Valor | Por qué |
| --- | --- | --- |
| Framework preset | Next.js (autodetectado) | Build `next build`; Vercel instala con `npm ci` por el `package-lock.json` |
| Node.js | **24.x**, fijado con `engines.node` en `package.json` (tiene prioridad sobre el ajuste del dashboard) | Ver abajo |
| Región de funciones | **`iad1`** (Washington D.C.), el valor por defecto de proyectos nuevos | Junto a Supabase `us-east-1`. Solo hay que comprobarla en Settings → Functions |
| Runtime | Node.js en todo (por defecto; ningún `export const runtime`) | sharp necesita Node; `proxy.ts` en Next 16 solo corre en Node |
| Variables | Solo las dos `NEXT_PUBLIC_*`, solo en **Production** (§13) | Previews sin acceso a la base |
| Deployment Protection | **Standard Protection** + Vercel Authentication (por defecto) | Protege previews y URLs por deployment; deja pública la URL de producción |

**Node 24.x en lugar de 26.x (el valor por defecto de Vercel desde el 29-oct-2026).**
- Node 24 es LTS soportada por Vercel y por todas las dependencias: Next ≥ 20.9, sharp ≥ 20.9,
  supabase-js ≥ 22.
- Toda la validación del MVP (unitarias, PGlite, E2E y QA) se hizo con Node 24.
- En Node 26, el `fetch` de las funciones de Vercel negocia **HTTP/2**, y todas las llamadas
  a Supabase pasan por `fetch`.
- Migrar a 26 es una tarea aparte: probar local con Node 26, cambiar `engines` a `26.x` y
  repetir la QA.

**sharp.** El lockfile incluye `@img/sharp-linux-x64` y `@img/sharp-libvips-linux-x64`, los
binarios que Vercel instala en Linux. Las Server Actions de imágenes corren en Node.

**`next/image`.** `remotePatterns` se calcula en el build desde `NEXT_PUBLIC_SUPABASE_URL`: el
host exacto del proyecto y solo `/storage/v1/object/public/product-images/**`.

**Previews (no deben poder mutar la base).**
1. Las variables de Supabase **no** se asignan a Preview.
   - Un preview sin variables **no llega a desplegarse**: el build falla al prerenderizar con
     "Faltan NEXT_PUBLIC_SUPABASE_URL…" (verificado localmente).
   - Es un fallo cerrado: nunca hay un preview conectado a la base actual.
2. Standard Protection exige iniciar sesión en Vercel para abrir cualquier preview.
3. Opcional, para evitar deployments fallidos ruidosos: Settings → Git → *Ignored Build Step*
   con "Only build production" (solo `main`).
4. Cuando exista un Supabase de staging, sus variables podrán asignarse a Preview.

**Indexación de preproducción.**
- `next.config.ts` define `SEARCH_INDEXING_ENABLED = false`. Con eso, todas las respuestas
  envían `X-Robots-Tag: noindex, nofollow` (una sola vez por respuesta, también en `/admin`).
- No se usa `robots.txt` con `Disallow`, porque impediría que los buscadores vieran el
  `noindex`.
- La navegación no cambia.
- Al lanzar: cambiar la constante a `true` y desplegar (§23).
- Las páginas privadas (`/admin`, carrito, checkout, pedido) conservan su propio `noindex`.

**HTTPS.**
- HSTS y la CSP vienen de `next.config.ts`; Vercel no añade una CSP propia.
- Las cookies de Auth de `@supabase/ssr` funcionan igual en HTTPS.
- `crypto.randomUUID()` en el navegador exige contexto seguro (HTTPS o localhost): cumplido.
- Los enlaces `wa.me` ya son HTTPS.
- Comprobar en QA remoto que no haya cabeceras duplicadas.


## 15. Supabase: ¿limpiar el actual o crear uno nuevo?

**Recomendación: limpiar y promover el proyecto actual.**

| | Limpiar el actual | Proyecto nuevo |
| --- | --- | --- |
| Migraciones | Ya aplicadas y registradas | Reaplicar las 12 (`db push`) |
| Storage (bucket, políticas) | Listo y probado | Recrear (vía migraciones) |
| Auth (registro desactivado, etc.) | Listo | Reconfigurar a mano |
| Riesgo de residuos | Bajo: inventario completo (§1–§3), limpieza en transacción | Ninguno |
| Pruebas | Todas las suites pasan contra este proyecto | Repetir |

Condiciones para que sea seguro: ejecutar la limpieza de §18 completa, eliminar la cuenta de
desarrollo (§10) y, como higiene, **rotar la contraseña de la base de datos** si se compartió
durante el desarrollo. La llave anon es pública por diseño; no hace falta rotarla.

Pendiente de verificar por el dueño en el dashboard: **plan del proyecto** (no visible en
modo solo lectura). Esto define backups (§16) y si el proyecto puede pausarse por
inactividad (proyectos gratuitos).

## 16. Backups

Según la documentación de Supabase:
- Pro/Team/Enterprise: backup diario automático (7/14/30 días); PITR como add-on de pago.
- Plan gratuito: sin backups accesibles; se recomienda exportar con `supabase db dump`.
- Los backups de la base **no incluyen** los archivos de Storage (solo sus metadatos).

Antes de producción:
- [ ] Confirmar el plan y, si es Pro, que aparecen backups diarios en Database → Backups.
- [ ] Hacer un dump manual **antes** de la limpieza de 9C.2 (`supabase db dump` de esquema
  y de datos), guardado fuera del repositorio (contiene datos personales de los pedidos de
  desarrollo). Borrarlo cuando ya no haga falta.
- [ ] Rutina post-lanzamiento (plan gratuito): dump periódico fuera del repositorio.
- [ ] Imágenes: el original vive en el equipo del cliente; Storage es la copia publicada.
- [ ] Migraciones: la fuente de verdad es `supabase/migrations` en git (nunca editar las
  aplicadas; solo nuevas).

## 17. Branding

**Logo real integrado (9C.2).** Fuente: JPG cuadrado de 1080×1080 entregado por el cliente
(círculo azul con "ABARROTES" / "ALEX"). El original no se versiona.

Los assets salen de `node scripts/brand-assets.mjs "<logo original>"`. El script solo hace
adaptaciones técnicas: recorte del margen blanco, máscara circular con transparencia, resize
y cambio de formato. No recolorea, no redibuja y no vectoriza (no existe un SVG original).

| Archivo | Tamaño | Uso |
| --- | --- | --- |
| `public/brand/logo.webp` | 512×512, transparente fuera del círculo (~34 KB) | Header de la tienda (40 px), panel (36 px), login (48 px) vía `BrandLogo` (`next/image` sirve 1x/2x) |
| `src/app/favicon.ico` | 16, 32 y 48 px (PNG embebidos) | Favicon |
| `src/app/icon.png` | 192×192, transparente | Ícono de alta resolución |
| `src/app/apple-icon.png` | 180×180, **opaco** | Apple touch icon: el cuadrado original, con fondo blanco, porque iOS pinta de negro la transparencia |

**Favicon.** Se usa el círculo completo. A 32 y 48 px "ALEX" se lee. A 16 px el texto no es
legible, pero el círculo azul con la masa blanca de "ALEX" sigue siendo reconocible.
Recortar solo "ALEX" no mejoraba a 16 px (≈6 px de alto) y se alejaba de la marca.

**Color.** El azul del logo (≈ #0049AF) es algo más oscuro que `primary` (#155EEF). El logo
se mantiene sin recolorear y la paleta de la UI no cambia.

**Accesibilidad.** El logo siempre acompaña al texto "Abarrotes Alex", así que usa
`alt=""` (decorativo) y la marca no se anuncia dos veces.

Se eliminó el monograma temporal "A" (`src/app/icon.svg` y los `<span>A</span>`).

## 18. Datos personales y privacidad

El sistema guarda nombre, teléfono, dirección, referencias y notas de cada pedido. Conviene
que el negocio, con la asesoría que corresponda, defina antes del lanzamiento:
- **Aviso de privacidad** accesible desde la tienda (hoy no existe página ni enlace;
  agregarlo sería un cambio menor de la app).
- Política básica de tratamiento: finalidad (atender el pedido), quién accede (personal del
  panel), plazo de conservación y cómo pedir borrado.

Esto es un asunto del negocio, no asesoría legal. Técnicamente ya se cumple: panel
privado, RLS, `noindex` y logs sin PII ([security.md](security.md) §18).

## 19. Plan de limpieza parcial (9C.2 — histórico, **no ejecutado**)

> Sustituido por la **limpieza definitiva del 2026-11-06** (ver «Estado limpio actual» al
> inicio), que vació el catálogo y los pedidos completos en lugar de solo los datos E2E.

Quién: requiere permisos que el admin no tiene por RLS (no hay `DELETE` de pedidos): lo
ejecuta el dueño en el SQL editor de Supabase o, con autorización explícita, el CLI sin
`--read-only`. Siempre después del dump de §16.

Una sola transacción, con verificaciones que abortan si algo no cuadra:

```sql
begin;

-- 0. Verificaciones previas (abortan si el estado no es el inventariado).
do $$ begin
  if (select count(*) from public.orders) <> 3
     or exists (select 1 from public.orders where folio not in ('ALEX-000001','ALEX-000002','ALEX-000003'))
  then raise exception 'Hay pedidos inesperados: no continuar'; end if;
end $$;

-- 1. Pedidos de desarrollo (partidas e historial caen en cascada).
delete from public.orders where folio in ('ALEX-000001','ALEX-000002','ALEX-000003');

-- 2. Folios: el primer pedido real será ALEX-000001.
do $$ begin
  if exists (select 1 from public.orders) then raise exception 'orders no está vacía'; end if;
end $$;
alter sequence public.order_folio_seq restart with 1;

-- 3. Promociones del producto E2E (hoy 0; por si acaso).
delete from public.promotions where branch_product_id in (
  select bp.id from public.branch_products bp join public.products p on p.id = bp.product_id
  where p.name like '\_\_E2E\_\_%');

-- 4. Producto E2E (branch_products y promociones caen en cascada).
delete from public.products where name like '\_\_E2E\_\_%';

-- 5. Taxonomía E2E y la subcategoría de prueba sin productos.
delete from public.subcategories
where name like '\_\_E2E\_\_%'
   or (slug = 'galletas' and category_id = (select id from public.categories where slug = 'botanas'));
delete from public.brands where name like '\_\_E2E\_\_%';
delete from public.categories where name like '\_\_E2E\_\_%';

-- 6. Verificación final antes de confirmar.
select (select count(*) from public.orders) pedidos,
       (select count(*) from public.products where name like '\_\_E2E\_\_%') e2e;

commit;  -- o rollback si algo no coincide
```

Orden por FKs: pedidos primero (liberan el `RESTRICT` de `order_items → products`), luego
promociones → productos (cascada a `branch_products`) → subcategorías (`RESTRICT` desde
productos) → marcas → categorías (`RESTRICT` desde subcategorías). Storage: no hay objetos
de prueba. Sucursal: **no se borra**; se actualiza con los datos reales (§6).

La cuenta admin de desarrollo se elimina **después** de crear y validar la del cliente (§10).

## 20. Reemplazo gradual del catálogo semilla (histórico)

> Ya no aplica: el seed se retiró completo en la limpieza definitiva y la tienda queda vacía
> hasta que el cliente cargue el catálogo real desde el panel.

Para no dejar la tienda vacía ni mezclar datos falsos con reales:

1. **Antes de abrir al público** (la tienda aún no se anuncia): limpieza §19 y actualizar
   sucursal y horario reales.
2. Decidir con el cliente qué categorías/subcategorías del seed se reutilizan; renombrarlas o
   crear las nuevas.
3. Cargar el catálogo real **inactivo** (importación §8 o panel).
4. Revisar con el cliente en el panel (filtro "Solo inactivos") y en una vista previa.
5. En una sola ventana: **activar el catálogo real y desactivar el seed** (los productos del
   seed se ocultan al instante; la tienda nunca queda vacía).
6. Retirar el seed definitivamente: promociones del seed → productos del seed → marcas
   ficticias → categorías/subcategorías no reutilizadas (ya sin pedidos que los referencien).
7. Promociones reales al final, con precios ya confirmados.

## 21. Pruebas después de la limpieza

**SAFE (pueden ejecutarse contra producción final):**
- `npm test`, `npm run test:db` (PGlite embebido; no tocan la base remota).
- `npm run test:security` (sin credenciales; nunca envía un pedido válido).
- `npm run test:e2e:store` (`/api/pedidos` simulado en el navegador; deja carrito vacío).
- Inspección manual de la tienda sin confirmar pedidos.

**Solo con una cuenta admin de pruebas (no existirá en producción):**
- `test:e2e`, `test:e2e:orders`, `test:e2e:admin` son de solo lectura, pero inician
  sesión: tras eliminar la cuenta de desarrollo no aplican, y no se crean credenciales de
  prueba en producción.

**DESTRUCTIVE (nunca contra producción final):**
- `test:e2e:order-lifecycle -- --crear-pedido` (crea un pedido y consume un folio).
- `test:e2e:promotions` / `test:e2e:cleanup` (crean y borran promociones `__E2E__`).
- Cualquier CRUD `__E2E__` persistente del panel.
- `test:e2e:states` es seguro para la base, pero requiere una instancia local con
  inyección de fallos (nunca el despliegue de producción).

Para seguir probando cambios destructivos después del lanzamiento: un proyecto Supabase
separado de desarrollo/staging (o el Supabase local con `supabase start`).

## 22. Checklist de go-live

**DATOS**
- [x] Backup previo a la limpieza (lógico, fuera del repositorio; 2026-11-06).
- [x] Limpieza definitiva ejecutada y verificada (0 pedidos, catálogo vacío, sequence
  reiniciada sin consumir; 2026-11-06).
- [x] Sucursal real: nombre, dirección, teléfono y WhatsApp (§6, 9C.2).
- [ ] Horarios reales (hoy los del seed, conservados temporalmente).
- [ ] WhatsApp probado manualmente con un pedido real controlado.
- [x] Seed retirado (limpieza definitiva).
- [ ] Catálogo real cargado desde el panel y revisado.
- [ ] Imágenes al menos de destacados (§9).
- [ ] Promociones reales (si hay).

**AUTH**
- [ ] Admin del cliente creado y validado (§10).
- [ ] Cuenta de desarrollo eliminada.
- [ ] Registro público sigue desactivado.
- [ ] Procedimiento de restablecimiento de contraseña acordado (dashboard o SMTP).

**SUPABASE**
- [ ] Plan confirmado (backups, pausas por inactividad).
- [ ] Contraseña de la base rotada si se compartió.
- [ ] Site URL = dominio de producción (y Redirect URLs si se implementa recuperación).
- [ ] Migraciones: `migration list` sin diferencias local/remoto.

**VERCEL**
- [ ] Proyecto, Node 24 (`engines`), región `iad1`, variables solo en Production (§13–§14).
- [ ] Previews sin variables y con Standard Protection.
- [ ] Build de producción exitoso.
- [ ] **Indexación activada**: `SEARCH_INDEXING_ENABLED = true` en `next.config.ts` (§23).

**DOMINIO**
- [ ] Dominio conectado, HTTPS activo, redirección www ↔ raíz definida.

**SEGURIDAD**
- [ ] `npm run test:security` contra el dominio final: 0 fallos.
- [ ] Sin `ADMIN_TEST_*` ni otras variables de prueba en Vercel.
- [ ] Riesgos aceptados revisados ([security.md](security.md) §0).

**QA**
- [ ] `npm run lint`, `typecheck`, `build`, `npm test`, `test:db` en verde en `main`.
- [ ] `test:e2e:store` contra el dominio final.
- [ ] Prueba manual en un iPhone (Safari) y un Android reales: navegar, carrito, checkout.
- [ ] **Primer pedido real controlado** con el dueño (debe salir ALEX-000001) y su recorrido
  en el panel hasta Entregado.

**CLIENTE**
- [ ] Información de §7 entregada y validada.
- [ ] Capacitación breve del panel (pedidos, estados, productos, promociones, imágenes).
- [ ] Aviso de privacidad definido por el negocio (§18).

**BACKUP**
- [ ] Backups automáticos visibles o rutina de dump acordada.
- [ ] Repositorio respaldado (remoto git).

**DOCUMENTACIÓN**
- [ ] Este documento actualizado con lo ejecutado (fecha, resultado).
- [ ] Checklist de [security.md](security.md) §21 revisada.

## 23. Deploy de preproducción (Fase 9D) y paso a producción

La primera URL `https://<proyecto>.vercel.app` es **preproducción**. Desde la limpieza
definitiva (2026-11-06) ya no contiene seed, datos `__E2E__` ni pedidos de desarrollo: la
tienda está vacía hasta que el cliente cargue su catálogo. El deploy no modifica la base.

### Pasos del deploy (los hace el dueño de las cuentas)

1. **Vercel → Add New → Project → Import** del repositorio de GitHub (rama de producción:
   `main`).
   - Framework detectado: Next.js.
   - Sin cambiar Build/Install/Output.
   - Root Directory: `./`.
2. **Antes del primer Deploy**, en *Environment Variables*, agregar solo para
   **Production**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Los valores son los mismos de `.env.local`. Desmarcar Preview y Development. Si se
   desplegó antes de tener las variables, el build falla: agregarlas y hacer *Redeploy*.
3. Deploy y anotar la URL de producción asignada (`<proyecto>.vercel.app`).
4. Comprobar en Settings:
   - **Functions → Region = Washington, D.C. (iad1)**.
   - **Build and Deployment → Node.js** (lo fija `engines` en 24.x de todos modos).
   - **Deployment Protection = Standard Protection**.
5. Opcional: Settings → Git → *Ignored Build Step* → "Only build production".

### Supabase Auth: URL Configuration (después de conocer la URL)

La app solo usa email + contraseña (`signInWithPassword`). No usa OAuth, magic links,
`redirectTo` ni recuperación de contraseña, así que el login **no depende** de estas URLs.
Se configuran para que los correos que se envían desde el dashboard (invitación o
restablecimiento) apunten al sitio real y no a `localhost`:

| Campo | Preproducción | Producción definitiva |
| --- | --- | --- |
| Site URL | `https://<proyecto>.vercel.app` | `https://<dominio-final>` |
| Redirect URLs | `https://<proyecto>.vercel.app/**` (y `http://localhost:3000/**` para desarrollo) | `https://<dominio-final>/**` (retirar la de vercel.app si deja de usarse) |

No agregar comodines de previews (`https://*-<equipo>.vercel.app/**`): los previews no
tienen acceso a la base.

### QA remoto (no destructivo)

Se ejecuta desde la máquina local contra la URL HTTPS. Las credenciales de prueba solo las
usa el navegador automatizado local; **nunca** van a Vercel.

```bash
E2E_BASE_URL=https://<proyecto>.vercel.app npm run test:security
E2E_BASE_URL=https://<proyecto>.vercel.app npm run test:e2e:store
E2E_BASE_URL=https://<proyecto>.vercel.app npm run test:e2e:admin
E2E_BASE_URL=https://<proyecto>.vercel.app npm run test:e2e:orders
```

- `test:e2e:store` simula `/api/pedidos` en el navegador.
- `test:e2e:admin` y `test:e2e:orders` son de solo lectura.
- No ejecutar `order-lifecycle`, `promotions`, `cleanup` ni subir o borrar imágenes.

Revisar además:
- headers: sin duplicados entre Vercel y Next;
- `X-Robots-Tag` presente;
- sin errores 5xx;
- tiempos razonables y arranque en frío;
- peso de JS e imágenes;
- logs de funciones en Vercel.

### Checklist manual en teléfono real (iPhone/Safari y Android/Chrome)

- [ ] Inicio: logo, sucursal, horario y teléfono (el enlace abre el marcador).
- [ ] Búsqueda: escribir filtra el grid en vivo, el teclado no se cierra, Atrás/Adelante, paginación.
- [ ] Catálogo: filtros por categoría y orden; tarjetas e imágenes.
- [ ] Carrito: agregar, cambiar cantidad, quitar; el contador del header se actualiza.
- [ ] Checkout: formulario, teclado numérico en teléfono y validaciones. **Sin confirmar el
  pedido** mientras siga siendo preproducción.
- [ ] Panel: login, menú móvil, dashboard, pedidos (lectura), productos y promociones
  (lectura), formularios abiertos y cerrados sin guardar.
- [ ] Zoom y rotación sin desbordes; ícono al "Agregar a pantalla de inicio" (apple-icon).

Solo se marca como probado lo que efectivamente se probó en un dispositivo físico.

### Paso de preproducción a producción

1. ~~Limpieza~~ (hecha el 2026-11-06) y carga manual del catálogo real por el cliente.
2. Horarios reales; admin del cliente (§10); eliminar la cuenta de desarrollo.
3. Dominio en Vercel y Supabase Auth URLs al dominio final.
4. `SEARCH_INDEXING_ENABLED = true` en `next.config.ts`, commit y deploy.
5. QA remoto contra el dominio final y checklist de go-live (§22).

## 24. Notificaciones de pedidos (Fase 10)

Ver [notifications.md](notifications.md). Pasos externos, en orden:

1. Generar claves VAPID y el secreto de despacho (local, sin versionar).
2. Aplicar la migración `20261106000200_order_notifications.sql` (`supabase db push --remote`).
3. Guardar el hash del secreto: `select private.set_push_dispatch_secret('<secreto>');` (SQL editor).
4. Vercel → Production: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Sensitive),
   `VAPID_SUBJECT`, `PUSH_DISPATCH_SECRET` (Sensitive). Redeploy.
5. Android de Alexander: instalar la app, iniciar sesión, activar notificaciones.
6. Pedido real controlado (con autorización) para validar push y panel en vivo.

El copy "¡Pedido recibido!" y WhatsApp opcional deben publicarse **junto con** los pasos 2–5:
sin ellos el pedido se registra, pero el dueño no recibe aviso.
