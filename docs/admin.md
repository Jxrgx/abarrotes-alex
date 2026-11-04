# Panel administrativo (Fase 8A)

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
| — | Pedidos | `/admin/pedidos`, `/admin/pedidos/[id]` | En construcción |
| — | Productos | `/admin/productos` | En construcción |
| Catálogo | Categorías · Subcategorías · Marcas | `/admin/categorias` … | En construcción |
| — | Promociones | `/admin/promociones` | En construcción |
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

## Próximas fases

- 8B+: CRUD de productos, categorías, subcategorías, marcas, promociones y sucursal.
- 8E: lista y detalle de pedidos, cambio de estado (con validación de transiciones).
- Selector de sucursal cuando exista más de una (`getAdminBranch(preferredId)` ya lo admite).
