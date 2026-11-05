# Panel administrativo (Fases 8A y 8B)

`/admin` es la herramienta de gestión de Abarrotes Alex. Autenticación, roles y
RLS en [auth.md](auth.md).

## Arquitectura

```
/admin/(panel)/layout.tsx   Suspense → requireAdmin() → AdminShell (sidebar / menú móvil)
/admin/(panel)/page.tsx     requireAdmin() → Suspense → admin_dashboard() → DashboardView
```

- Cada página llama `requireAdmin()` (además del layout): layouts y páginas se
  renderizan en paralelo. La llamada se reutiliza dentro del mismo request.
- Datos administrativos **solo** con el cliente autenticado (`lib/supabase/server.ts`);
  nunca el cliente público ni `service_role`. `getAdminContext()` conserva
  `await connection()` (ver auth.md).
- Server Components por defecto. Client Components solo para la navegación
  (`usePathname`), el menú móvil (`<dialog>`) y cerrar sesión.

## Navegación

Definida una sola vez en `src/lib/admin/navigation.ts` (sidebar y menú móvil):

| Grupo | Módulo | Ruta | Estado |
| --- | --- | --- | --- |
| — | Inicio | `/admin` | Dashboard (Fase 8A) |
| — | Pedidos | `/admin/pedidos`, `/admin/pedidos/[id]` | Listado, detalle y estados (Fase 8E) |
| — | Productos | `/admin/productos` | CRUD + precio por sucursal (Fase 8C.1) |
| Catálogo | Categorías · Subcategorías · Marcas | `/admin/categorias` … | CRUD (Fase 8B) |
| — | Promociones | `/admin/promociones` | Precio promocional (Fase 8D) |
| — | Sucursales | `/admin/sucursales` | En construcción |

- Activo: `isAdminNavActive()` — Inicio solo exactamente en `/admin`; cada módulo
  en su ruta y subrutas (`/admin/pedidos/[id]` → Pedidos). Se marca con `aria-current="page"`.
- **Desktop (lg+)**: barra lateral fija con marca, navegación, usuario, rol y "Cerrar sesión".
- **Móvil/tablet**: barra superior con botón **Menú** que abre un panel lateral
  (`<dialog>`: foco atrapado, Esc cierra, elegir un módulo lo cierra). No se meten
  8 módulos en una fila deslizable.
- Los placeholders están protegidos y usan el layout; `/admin/pedidos/[id]` no
  consulta datos todavía (detalle real en la Fase 8E).

## Zona horaria del negocio

`BUSINESS_TIME_ZONE = "America/Merida"` en `src/lib/business.ts` (única definición;
en el futuro puede venir de cada sucursal). Se usa para:

- calcular "hoy" en PostgreSQL (`admin_dashboard` recibe la zona como parámetro):
  `[00:00, 24:00)` hora local, nunca UTC;
- mostrar horas (`src/lib/datetime.ts`, `Intl.DateTimeFormat` con `timeZone`).

El render nunca usa la hora actual: "hoy" llega calculado por la base
(`today_start`) y las horas se formatean a partir de `created_at`.

## Dashboard: definición de métricas

Todo se calcula en PostgreSQL con `public.admin_dashboard(branch, zona, estados pendientes)`
(migración `…000700`), en una sola llamada:

| KPI | Definición |
| --- | --- |
| **Pedidos hoy** | Pedidos creados hoy (zona del negocio) en la sucursal. **Incluye cancelados** (se indica cuántos). |
| **Importe de pedidos** | Suma de `orders.total` de hoy **sin cancelados**. Es el total conocido: el envío por confirmar no está incluido. No es dinero cobrado. |
| **Pedidos pendientes** | Pedidos de **cualquier fecha** en estado pendiente (requieren operación). |
| **Ticket promedio** | Importe de pedidos ÷ pedidos de hoy **no cancelados**; `$0.00` si no hay. |

Se evita la palabra "ventas": el sistema registra pedidos, no cobros.

**Estados pendientes** — `PENDING_ORDER_STATUSES` en `src/lib/orders/status.ts`
(única definición; se pasa a la función): `new`, `confirmed`, `preparing`, `ready`,
`on_the_way`, `ready_for_pickup`. No pendientes: `delivered`, `cancelled`.

### Pedidos recientes

Los 8 más recientes de la sucursal: folio (enlace a `/admin/pedidos/[id]`), cliente,
entrega, total (con "+ envío" si el envío está por confirmar), estado y hora
("Hoy, 4:41 p.m." o "2 nov, 5:05 p.m."). Tabla en desktop; lista en móvil (sin scroll horizontal).

### Productos más pedidos

Top 5 de los **últimos 30 días**, sin pedidos cancelados, por cantidad pedida
(desempate: número de pedidos). Se agrupa por **`product_id`** —identidad estable
aunque el producto cambie de nombre— y se muestra el **snapshot más reciente**
(`order_items.product_name` + presentación), no el nombre actual de `products`.
Se llama "más pedidos", no "más vendidos".

### Estados de pedido

`OrderStatusBadge`: siempre texto + color suave del sistema de diseño.

| Estado | Texto | Tono |
| --- | --- | --- |
| new | Nuevo | marca (azul suave) |
| confirmed | Confirmado | neutro |
| preparing | Preparando | advertencia |
| ready | Listo | éxito |
| on_the_way | En camino | marca |
| ready_for_pickup | Listo para recoger | éxito |
| delivered | Entregado | éxito |
| cancelled | Cancelado | error suave |

Sin gráficas en esta fase (decisión explícita: 4 KPIs + listas útiles).

## Seguridad de `admin_dashboard`

- `SECURITY INVOKER`: corre con la RLS del usuario (solo el admin lee pedidos).
- Rechaza a quien no es admin con `FORBIDDEN` (employee incluido).
- `EXECUTE` revocado a `anon` y `public`; solo `authenticated`.
- Los errores se registran solo con su código y se muestra "No pudimos cargar el
  resumen" con "Reintentar"; un error de consulta no cierra la sesión.

## Estados de carga, vacío y error

- Carga: esqueletos de KPIs y paneles (`DashboardSkeleton`) dentro de `<Suspense>`.
- Vacío: KPIs en 0 / `$0.00`, "Aún no hay pedidos.", "Aún no hay suficiente información."
- Error: mensaje amigable sin detalles internos.
- Actualizar: recargar la página (sin Realtime ni polling por ahora).

## Responsive

- 390px: KPIs en 2 columnas, pedidos recientes como lista, ranking debajo.
- 1440px: KPIs en una fila, pedidos recientes (tabla) + ranking en dos columnas.

## Pruebas

- PGlite: `admin_dashboard` (anon sin permiso, employee FORBIDDEN, 0 pedidos,
  cancelados, pendientes, zona horaria en la frontera de medianoche, ranking sin
  cancelados ni pedidos de más de 30 días, producto renombrado).
- Remoto: llamada como admin simulado en transacción revertida (solo conteos) y
  `anon` rechazado.
- Unitarias: estados, fechas en America/Merida, conversión a centavos, navegación activa.
- Navegador: las 9 rutas del panel redirigen al login sin sesión; revisión visual
  del dashboard con datos de ejemplo en una vista previa temporal (eliminada).
- Fase 8B: unitarias (`catalog-forms.test.ts`: slug, validación, errores, consecuencias,
  orden sugerido, búsqueda); PGlite (permisos por rol, constraints de slug, mover,
  desactivar/reactivar, conteos y visibilidad pública); remoto en transacción revertida;
  navegador sobre una vista previa temporal (eliminada) a 390/1440 y Server Action sin
  sesión → login sin guardar.

## Patrón CRUD (Fase 8B: Categorías, Subcategorías y Marcas)

Base para los siguientes módulos (productos, promociones, sucursales). Sin framework
genérico: piezas pequeñas que cada módulo compone con sus columnas explícitas.

```
page.tsx (Server)    requireAdmin() → Suspense(ListSkeleton) → loadAdminSection(listAdmin…) → Manager | AdminLoadError
*-manager.tsx        búsqueda/filtros en memoria, tabla (md+) / tarjetas (móvil), diálogos
catalog-actions.ts   Server Actions: requireAdmin → Zod → cliente autenticado (RLS) → revalidatePath
```

| Archivo | Responsabilidad |
| --- | --- |
| `src/lib/admin/catalog.ts` | Listados con conteos (server-only, cliente autenticado). |
| `src/lib/admin/catalog-actions.ts` | `saveCategory/Subcategory/Brand(formData)`, `set…Active(id, bool)`. |
| `src/lib/admin/catalog-forms.ts` | Esquemas Zod, mapeo de errores, textos de éxito y de consecuencias (puro, probado). |
| `src/lib/admin/load.ts` | `loadAdminSection()`: error de consulta → estado, nunca cierra la sesión. |
| `src/lib/slug.ts` | `slugify()` (única definición). |
| `components/admin/admin-list.tsx` | `AdminPageHeader`, `SearchInput`, `ActiveBadge`, `AdminTable`, `AdminCardList`/`AdminCard`, `MetaList`, `ListSummary`, `NoResults`, `EmptyState`, `ListSkeleton`, `AdminLoadError`. |
| `components/admin/admin-dialog.tsx` | Diálogo adaptativo (`<dialog>` nativo): hoja inferior en móvil, modal ≤ 512px en sm+. |
| `components/admin/catalog-form.tsx` | `CatalogFormDialog` + campos `NameField`, `SortOrderField`, `ActiveField`, `WarningNote`. |
| `components/admin/active-toggle.tsx` | `useActiveToggle` + `DeactivateDialog`. |
| `components/admin/row-actions.tsx` | "Editar" + menú ⋯ (Base UI Menu). |
| `components/admin/toast.tsx` | Avisos ligeros (`ToastProvider` en `AdminShell`, `useToast`). |

### Seguridad

- Cada Server Action es un endpoint público: **siempre** `requireAdmin()` primero
  (sin sesión → redirige al login sin tocar la base; verificado).
- Validación con Zod en el servidor; el cliente usa el **mismo esquema** solo para
  errores inline inmediatos.
- Cliente autenticado (`createClient()`): la RLS (`private.is_admin()`) y las
  constraints son la autoridad final. Nunca el cliente público ni `service_role`;
  nunca escrituras desde el navegador.
- Sin borrado físico: no hay acción de borrar y además el privilegio `DELETE` está revocado.
- Un `UPDATE` que no afecta filas (registro inexistente o sin permiso) se reporta como
  "No encontramos esta …", nunca como éxito.

### Formularios

- Alta y edición en el **mismo diálogo** (sin rutas `/nueva`): son entidades de 2–4 campos.
- `onSubmit` + `useTransition` (como el login): sin doble envío (botón deshabilitado y
  "Guardando…"), el diálogo no se cierra con Esc/× mientras guarda, y **si falla se
  conservan los valores** y se muestra el error (inline por campo o banner).
- Foco inicial en Nombre; tras un error, foco en el primer campo inválido.
- Errores siempre en español, sin SQL, constraints ni códigos (solo se registra el código en el servidor).
- No se usa React Hook Form: con 2–4 campos, formulario nativo + Zod es más simple.

### Slugs

`slugify(name)`: NFD sin diacríticos → minúsculas → cualquier secuencia que no sea
`[a-z0-9]` se vuelve un guion → sin guiones al inicio ni al final. "Lácteos" → `lacteos`,
"Refrescos y bebidas" → `refrescos-y-bebidas`, "Doña María" → `dona-maria`. Un nombre sin
letras ni números se rechaza. El administrador nunca escribe el slug; el formulario muestra
el identificador que se generará.

**Al editar el nombre se regenera el slug.** Las URLs públicas usan slugs solo como
filtros (`/productos?categoria=…&subcategoria=…&marca=…`); un slug viejo no rompe la
página (se ignora y se muestra el aviso de filtro omitido, ver catalog.md). Como estamos
en desarrollo y no hay URLs indexadas, es aceptable. El formulario avisa cuando el
identificador va a cambiar. Si en el futuro hay URLs permanentes, habrá que conservar
el slug o registrar redirecciones.

**Colisiones**: la constraint `UNIQUE` es la autoridad (también entre dos admins a la
vez). `23505` → "Ya existe una categoría/marca con ese nombre." o "Ya existe una
subcategoría con ese nombre en esta categoría." junto al campo Nombre. No se agregan
sufijos `-2` automáticos. Nombres equivalentes ("Lácteos" y "lacteos") chocan a propósito.

### Desactivar y jerarquía (soft disable)

Nada se desactiva en cascada; la visibilidad pública la resuelve RLS (verificado en
PGlite y en remoto):

| Se desactiva | En la tienda | Qué NO cambia |
| --- | --- | --- |
| Categoría | Desaparecen la categoría, sus subcategorías y sus productos (y sus `branch_products`: carrito y checkout tampoco los resuelven). | Subcategorías y productos siguen activos; vuelven al reactivarla. |
| Subcategoría | Desaparecen ella y sus productos. | Los productos siguen activos. |
| Marca | Sale del filtro de marcas; sus productos **siguen a la venta**, sin mostrar la marca (el embed `brands` sin `!inner` llega `null`). | Productos intactos. |

La semántica de marca ya era la de la RLS original (`…000200`: "la marca inactiva no
oculta el producto") y coincide con la preferencia de negocio, así que no se cambió
ninguna política. La marca sigue siendo **opcional** en productos (no existe "Sin marca").

- Desactivar desde el listado pide **confirmación** con la consecuencia concreta
  (incluye conteos). Desactivar desde el formulario (desmarcar "Activa") muestra la misma
  explicación antes de guardar.
- **Reactivar** es directo (menú ⋯ → Activar): es la acción segura. El listado muestra
  activas e inactivas (badge "Activa"/"Inactiva" con texto y punto; el nombre inactivo en gris).
- Una subcategoría de una categoría inactiva se marca "Categoría inactiva: no se ve en la tienda".

### Mover una subcategoría de categoría

La categoría de un producto es derivada (`products → subcategories → categories`), así que
mover una subcategoría mueve todos sus productos. Si tiene productos, el formulario muestra
"Esta subcategoría contiene N productos. Al cambiarla de categoría, esos productos también
pasarán a X." y exige marcar "Sí, mover la subcategoría y sus productos". El **servidor lo
vuelve a comprobar** con el conteo actual (`confirmMove`); si falta la confirmación no
guarda. No se bloquea el movimiento.

### Orden

`sort_order` entero de 0 a 9999 con campo numérico (sin drag & drop). Al crear se sugiere
la siguiente decena (10, 20, 30…) para poder intercalar después. Marcas no tienen orden
(se listan por nombre).

### Listados, búsqueda y conteos

- Una consulta por listado con conteos embebidos de PostgREST (`subcategories(count)`,
  `products(count)`): sin N+1. Productos de una categoría = suma de sus subcategorías.
  Los conteos incluyen registros inactivos (es lo que se afecta al desactivar o mover).
- Búsqueda por nombre en el cliente (sin acentos ni mayúsculas, "contiene"): son decenas
  de registros. No usa Fuse.js ni el live search de la tienda. Si un módulo superara
  ~500 filas, filtrar en el servidor con `?q=`.
- Subcategorías: filtro por categoría (incluye inactivas) y orden de la tienda (orden de
  categoría, luego de subcategoría).

### Mutaciones y feedback

- Las acciones llaman `revalidatePath` de las tres rutas del catálogo (comparten nombres y
  conteos): Next.js re-renderiza la ruta actual en el mismo viaje y la UI cambia sin
  recargar. La tienda no usa caché (`"use cache"`), así que lee el cambio en la siguiente visita.
- Avisos: "Categoría creada", "Subcategoría actualizada", "Marca desactivada", "… activada".
  Región `aria-live` siempre presente, 5 s o cerrar con ×. Errores de reactivación (sin
  diálogo) también como aviso.

### Responsive

- **Móvil**: tarjetas (nombre + slug, "Editar" + ⋯ arriba; estado, conteos y orden a todo
  el ancho debajo). CTA compacto "Nueva" junto a la búsqueda. Diálogos como hoja inferior
  a todo el ancho con botones de 44px apilados.
- **md+**: tabla compacta; CTA "Nueva categoría/subcategoría/marca"; diálogos centrados.
- Targets ≥ 40px, sin overflow horizontal (verificado a 390 y 1440).

## Productos (Fase 8C.1)

`/admin/productos` reutiliza el patrón CRUD de 8B (página → `loadAdminSection` →
`ProductManager`; `CatalogFormDialog` con `validate`, tamaño `lg`; `useActiveToggle`,
`RowActions`, avisos). Archivos: `src/lib/admin/products.ts` (consultas),
`product-actions.ts` (Server Actions), `product-forms.ts` (validación pura, probada),
`components/admin/product-manager.tsx` y `product-form.tsx`.

### Modelo: products ≠ branch_products

- `products`: datos globales (nombre, slug, `subcategory_id`, `brand_id` opcional,
  presentación + unidad, `sale_type`, destacado, activo). **Sin precio ni categoría.**
- `branch_products`: precio y disponibilidad **por sucursal**. El formulario los muestra en
  la sección "Precio y disponibilidad", una tarjeta por sucursal.
- La categoría solo existe en la UI (selector dependiente): se guarda únicamente `subcategory_id`.

### Atomicidad: `public.admin_save_product()` (migración `…000800`)

Crear o editar escribe `products` y `branch_products`. Dos llamadas a la API podrían dejar
un producto sin precio; por eso la Server Action hace **una** llamada RPC a una función
plpgsql (una llamada = una transacción: si falla el precio, no queda el producto).

- `SECURITY INVOKER`: usa las políticas RLS administrativas existentes; no usa
  `service_role` ni salta RLS. Además rechaza a quien no es admin (`FORBIDDEN`).
  `EXECUTE` solo para `authenticated`.
- Precios como **texto** (`"18.50"`), validados con formato estricto antes de convertir a
  `numeric(10,2)`; un número JSON se rechaza (nunca se usa float como autoridad).
- `INSERT … ON CONFLICT (branch_id, product_id) DO UPDATE`: editar no duplica filas. No
  borra productos ni quita sucursales; no toca promociones.
- Se descartó: dos escrituras desde la Server Action (sin transacción) y un trigger que
  creara `branch_products` (no sabría el precio).

Acciones rápidas (activar/desactivar, disponible/agotado) son un `UPDATE` de una sola
tabla, así que no necesitan la función.

### Activo vs disponible

| Estado | En la tienda |
| --- | --- |
| Activo + Disponible | Visible y comprable |
| Activo + Agotado | Visible con "Agotado"; no se puede agregar al carrito |
| Inactivo | No se muestra (RLS) |

El encabezado de la página lo explica; el listado muestra Disponibilidad (texto o badge
"Agotado") y Estado (badge Activo/Inactivo) en columnas separadas. Desactivar pide
confirmación ("El producto dejará de mostrarse en la tienda. Los pedidos anteriores
conservarán su información."); no toca `order_items`.

### Formulario

Diálogo grande (máx. 672px; hoja a pantalla casi completa en móvil) con secciones:
**Información** (placeholder de imagen; Storage en 8C.2), **Clasificación**,
**Presentación y venta**, **Precio y disponibilidad**, **Visibilidad**.

- **Categoría → Subcategoría**: la subcategoría se habilita al elegir categoría y solo
  muestra las de esa categoría. En alta solo aparecen activas; al editar se conserva la
  selección actual aunque esté inactiva, marcada "(inactiva)". Igual para la marca.
- **Marca**: "Sin marca" = `brand_id NULL` (no existe una fila ficticia).
- **Presentación**: Unidad (`Sin presentación`, ml, L, g, kg, piezas; valores del enum
  generado `Constants.public.Enums.product_unit`) + Cantidad (> 0, hasta 3 decimales). Sin
  unidad, la cantidad se deshabilita: no se puede dejar una sola de las dos (además el CHECK
  de la BD lo impide). Vista previa "Se mostrará como 1.5 L".
- **Tipo de venta**: "Por unidad" / "Por peso". Por peso solo muestra la advertencia
  "Actualmente la tienda vende este producto por unidades completas de su presentación. Las
  cantidades fraccionarias se habilitarán en una fase futura." No hay ninguna restricción
  entre `sale_type` y `unit` en la aplicación: solo valen el enum y los CHECK de la BD.
  (Una regla "por peso → g o kg" agregada en 8C.1 se eliminó en la auditoría E2E: no forma
  parte del dominio acordado.)
- **Precio**: obligatorio por sucursal, 0 a 99,999.99, máx. 2 decimales, en MXN. La coma
  solo se acepta como separador de miles ("1,234.50"; "18,50" se rechaza). **$0 se permite**
  (la BD lo admite) con el aviso "Este producto aparecerá con precio $0.00.". Al editar:
  "Los pedidos anteriores conservarán el precio con el que fueron realizados."
- Slug regenerado desde el nombre con `slugify` (vista previa discreta); colisión →
  "Ya existe un producto con ese nombre." junto al nombre.

### Promociones existentes

No se editan en esta fase. Si el nuevo precio deja una promoción vigente ≥ precio, el
formulario avisa ("Existe una promoción de $15.00. Con el nuevo precio de $14.00, esa
promoción dejará de aplicarse.") sin bloquear ni modificar la promoción: la tienda y
`create_order` solo aplican promociones menores al precio. El listado muestra el precio
tachado y "Oferta $15.00" cuando la promoción vigente aplica (vigencia calculada con la
hora de la petición, misma regla que la RLS pública).

### Duplicar

Menú ⋯ → **Duplicar** abre el formulario de alta precargado (categoría, subcategoría,
marca, presentación, unidad, tipo de venta, precio y disponibilidad), con nombre
"Copia de …", destacado desmarcado y activo. **No guarda hasta "Crear producto"**. No copia
id, slug (se genera del nombre nuevo), fechas ni imagen. Aviso: "Producto duplicado".

### Listado, búsqueda, filtros y paginación

- Una consulta con embeds (producto + subcategoría + categoría + marca + `branch_products` +
  promociones) y las opciones del formulario en paralelo: sin N+1.
- Desktop: Producto (miniatura, nombre, presentación · marca, ★ Destacado), Categoría
  (subcategoría debajo), Precio, Disponibilidad, Estado, acciones. Móvil: tarjetas con lo
  mismo; el nombre ocupa hasta 2 líneas.
- Precio y disponibilidad del listado: sucursal de `getAdminBranch()` (hoy la única).
- Búsqueda en memoria (sin Fuse): todas las palabras deben aparecer en nombre, marca,
  categoría o subcategoría, sin acentos. Filtros: categoría, estado, disponibilidad.
- **Paginación**: todo llega en una consulta (100–500 productos es poco) y se filtra en
  memoria; solo se renderizan 50 filas por página (Anterior / Siguiente). Con miles de
  productos habría que paginar en el servidor.
- Acciones por fila: "Editar" + ⋯ (Duplicar, Marcar agotado/disponible, Desactivar/Activar).
  Marcar agotado/disponible es directo, sin confirmación (reversible, frecuente).

### Revalidación y tienda

Cada mutación revalida `/admin/productos`, las tres rutas del catálogo admin (conteos),
`/` (destacados) y `/productos`. La tienda no usa caché, así que producto nuevo, precio,
agotado, inactivo y destacado se ven en la siguiente visita. El índice de la búsqueda
instantánea (`/api/busqueda`) se calcula en cada petición, pero el navegador lo guarda
hasta 60 s (`max-age=60`) y se pide una vez por visita: un cambio aparece en la búsqueda
instantánea como máximo ~1 minuto después. No se modificó Fuse.

### Multisucursal

Sin selector global de sucursal. El formulario muestra una tarjeta de precio por cada
sucursal activa (y las inactivas que ya tengan precio para el producto); la función acepta
un arreglo de sucursales. Pendiente cuando haya varias: permitir "no se vende en esta sucursal".

## Auditoría E2E autenticada (antes de 8C.2)

Auditoría con sesión real (cuenta de desarrollo, credenciales solo en `.env.local` como
`ADMIN_TEST_EMAIL` / `ADMIN_TEST_PASSWORD`; `.env.example` solo tiene las claves vacías).
Los datos de prueba usan el prefijo `__E2E__` y quedan **inactivos** (no hay DELETE).
Corrigió tres bugs:

1. **`requireAdmin()` en la raíz de cada página** bloqueaba la navegación instantánea
   (en desarrollo: "encountered uncached data … outside of `<Suspense>`"). En una navegación
   del cliente el `<Suspense>` del layout no cubre a la página. Ahora cada página usa
   **`AdminGuard`** (`components/admin/admin-guard.tsx`): `requireAdmin()` dentro de su propio
   `<Suspense>`; el contenido protegido se renderiza solo después de verificar. Los
   encabezados estáticos quedan fuera (se ven al instante); el saludo del dashboard, dentro.
2. **El aviso y el cierre del diálogo llegaban antes que los datos nuevos** (~100–250 ms):
   reabrir "Editar" de inmediato precargaba valores viejos y guardar podía revertir el
   cambio anterior. Las actualizaciones posteriores al `await` de la acción se envuelven en
   `startTransition` (React 19) en `CatalogFormDialog`, `useActiveToggle` y la acción rápida
   de disponibilidad: el cierre, el aviso y los datos revalidados se aplican juntos.
3. **Foco perdido al cerrar un diálogo abierto desde el menú ⋯** (Desactivar, Duplicar…):
   `AdminDialog` desmontaba el contenido antes de `close()` y el elemento enfocado era un
   ítem del menú que desaparece. Ahora `AdminDialog` guarda a dónde volver al abrir (el botón
   que abrió el menú, si venía de uno) y devuelve el foco explícitamente al cerrar.

Además se eliminó la regla "por peso → g o kg" (no forma parte del dominio).

## Imágenes de producto (Fase 8C.2)

Sección **Imagen del producto** del formulario: miniatura (actual o vista previa local),
"Seleccionar imagen" / "Cambiar" / "Eliminar" (o "Descartar" una selección nueva,
"Deshacer" una eliminación) y el requisito "JPG, PNG o WebP. Máximo 10 MB.". Nada se sube
al seleccionar: el archivo viaja con el formulario y se procesa al **guardar el producto**
(`imageAction` = keep | replace | remove). Errores amigables: "El archivo es demasiado
grande.", "Usa una imagen JPG, PNG o WebP.", "No pudimos procesar la imagen.", "No pudimos
guardar la imagen. Intenta de nuevo.". Si el producto se guarda pero la imagen no, el aviso
lo dice explícitamente. Duplicar no copia la imagen. Las miniaturas del listado usan la
foto real. Detalles de bucket, seguridad, paths y compensación: [storage.md](storage.md).

## Promociones (Fase 8D)

`/admin/promociones` reutiliza el patrón CRUD (`AdminGuard` → `loadAdminSection` →
`PromotionManager`; `CatalogFormDialog` grande; `useActiveToggle`; `RowActions`).
Archivos: `src/lib/admin/promotions.ts` (consulta), `promotion-actions.ts` (Server
Actions), `promotion-forms.ts` (estados, validación y errores; probado),
`components/admin/promotion-manager.tsx` y `promotion-form.tsx` (buscador de productos).
Semántica, estados, zona horaria y reglas de la base: [promotions.md](promotions.md).

## Pedidos (Fase 8E)

Responde "¿qué pedidos tengo que atender y qué hago con cada uno?". No es un CRM.

### Listado `/admin/pedidos`

- Más recientes primero. Tabla en desktop (folio, cliente, entrega, total con "+ envío" si
  está por confirmar, estado, fecha, "Ver pedido"); tarjetas enlazadas en móvil. Sin
  dirección en el listado.
- **Filtros en la URL** (fuente de verdad: refresh, atrás/adelante, enlaces):
  `?estado=new|…|pendientes&entrega=delivery|pickup&periodo=hoy|7d|30d|todos&q=…&page=N`.
  Formulario `GET` normal; los selects se envían al cambiar. Valores inválidos se ignoran.
- **Búsqueda** por folio, nombre o teléfono, en el servidor (sin Fuse; los datos nunca van
  a la tienda). El texto se sanea a letras, números, espacios y guion.
  - **Nombre sin acentos ni mayúsculas, conservando la ñ**: "Maria" → "María", "ANGEL" →
    "Ángel", "Martin" → "Martín"; pero "Pena" **no** encuentra "Peña" (en español son letras
    distintas). Se compara contra la columna generada `orders.customer_name_search`
    (`private.order_search_normalize`, migración `…001200`) con el mismo algoritmo en
    TypeScript (`normalizeOrderSearch`).
  - **Folio** sin importar mayúsculas. **Teléfono** por dígitos (acepta espacios), solo si el
    texto no tiene letras: así buscar "ALEX-000123" no trae pedidos cuyo teléfono contenga "000123".
  - Se combina con filtros y paginación (todo en la misma consulta).
- **Periodos** en el día de negocio de Mérida (`periodStart`, `src/lib/admin/order-filters.ts`).
- **Paginación en el servidor**: 25 por página (`range` + `count: exact` de PostgREST);
  solo esa página viaja al navegador. Página fuera de rango → lista vacía.
- Vacío: "Aún no hay pedidos."; con filtros: "No encontramos pedidos con estos filtros." +
  "Limpiar filtros".

### Detalle `/admin/pedidos/[id]`

- Arriba (lo operativo): folio, estado, tipo de entrega, cliente, fecha y sucursal, y las
  acciones. En móvil, además, **barra inferior fija** con la acción siguiente y "Cancelar"
  (respeta `safe-area`; el contenido tiene padding para no quedar tapado).
- Cliente (teléfono legible, enlace `tel:` y "Escribir al cliente por WhatsApp": abre
  `wa.me` del **cliente**, sin mensaje predefinido; no es el WhatsApp de la sucursal),
  entrega (dirección como texto, sin mapas), pago ("Efectivo", "Paga con", "Cambio
  aproximado" sobre el total conocido y aviso si el envío está por confirmar), productos
  del **snapshot** de `order_items`, resumen (envío NULL = "Por confirmar", "Total sin
  envío"), notas e historial.
- **Historial**: lista cronológica (`<ol>`) con estado, fecha/hora de Mérida y quién:
  "Sistema" (`changed_by` NULL), "Tú (nombre)" o "Otro administrador" (la RLS de
  `profiles` solo deja leer el propio perfil; nunca se muestra un UUID).
- Id inválido o pedido inexistente → `notFound()` (misma respuesta para no revelar nada).

### Cambiar estado

- Solo se ofrece la transición siguiente válida ("Confirmar pedido", "Empezar a preparar",
  "Marcar listo", "Enviar (en camino)" / "Listo para recoger", "Marcar entregado") y
  "Cancelar pedido" (confirmación: "¿Cancelar el pedido ALEX-…? El pedido quedará como
  cancelado y no podrá reactivarse."). Estados finales: "Estado final: ya no se puede cambiar."
- Server Action `changeOrderStatus` → `update_order_status` con el **estado esperado**
  (ver [orders.md](orders.md)). Revalida `/admin` (dashboard), `/admin/pedidos` y el detalle.
- Avisos: "Pedido confirmado", "Pedido en preparación", "Pedido listo", "Pedido en camino",
  "Pedido listo para recoger", "Pedido entregado", "Pedido cancelado".

### Privacidad

Nombre, teléfono, dirección y notas son datos personales: solo el admin los lee (RLS), no
se registran en logs (solo códigos de error), no van a la tienda ni a pruebas versionadas
(datos sintéticos), y las capturas E2E quedan en una carpeta ignorada por git.

## Próximas fases
- Promociones y sucursales (reutilizando el patrón anterior).
- 8E: lista y detalle de pedidos, cambio de estado (con validación de transiciones).
- Selector de sucursal cuando exista más de una (`getAdminBranch(preferredId)` ya lo admite).
