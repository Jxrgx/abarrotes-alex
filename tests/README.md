# Pruebas

| Comando | Qué prueba | Requiere |
| --- | --- | --- |
| `npm test` | Unitarias (`src/**/*.test.ts`, `node --test`) | — |
| `npm run test:db` | Integración con PostgreSQL embebido (PGlite): migraciones + seed + RLS, máquina de estados de pedidos, promociones, Storage | — |
| `npm run test:security` | Seguridad **sin credenciales**: headers, endpoints públicos con entradas abusivas (nunca un pedido válido), panel sin sesión, RPC y Storage con la llave pública | App corriendo, `.env.local` (solo variables públicas) |
| `npm run test:e2e` | Regresión en navegador: auth, módulos del panel, tienda, búsqueda instantánea y carrito | App corriendo, Chrome, `.env.local` |
| `npm run test:e2e:store` | Tienda como cliente (móvil y desktop): inicio, catálogo, búsqueda completa e instantánea (teclado, mouse, fallback), carrito (cantidades, multitab, storage corrupto, API caída), checkout hasta el envío y confirmación. **`/api/pedidos` se intercepta en el navegador y se simula**: nunca llega al servidor (no crea pedidos ni consume folios) | App corriendo, Chrome |
| `npm run test:e2e:admin` | Panel con sesión real, **solo lectura**: dashboard, teclado (skip link, menú móvil, diálogos con trampa de foco y Escape), formularios enviados solo vacíos y cerrados sin guardar, estado del producto `__E2E__`, pedidos (ALEX-000003 terminal), responsive 320–1440 y zoom 200 % | App corriendo, Chrome, `.env.local` |
| `npm run test:e2e:dialogs` | `AdminDialog` en todos los módulos (Nueva/Editar/Duplicar y confirmación) a 320, 375, 390 y 430 (táctil) y 768/1440 (modal), **solo lectura**: hoja anclada al fondo, una sola zona de scroll, título y acciones visibles, sin foco en campos de texto al abrir en táctil, Esc y retorno del foco, y **teclado simulado** (`visualViewport` reducido). Chromium no reproduce Safari iOS: la prueba final es en un iPhone físico | App corriendo, Chrome, `.env.local` |
| `npm run test:e2e:states` | Estados de error y vacíos con Supabase **simulado** caído o vacío (ver abajo) | Instancia local con `fault-injection.mjs` |
| `npm run test:e2e:orders` | Pedidos con sesión real, **solo lectura** (no cambia estados) | Ídem |
| `npm run test:e2e:promotions -- <runId>` | Promociones con sesión real sobre el producto `__E2E__ Producto <runId>` | Ídem + datos `__E2E__` |
| `npm run test:e2e:order-lifecycle -- --crear-pedido` | ⚠️ **Crea UN pedido persistente** (consume un folio; no se borra) con datos sintéticos por la tienda y lo recorre por el panel hasta Entregado. Solo ejecución explícita: `--ensayo` valida el checkout sin crear nada; `--continuar=ALEX-…` reanuda sobre el pedido E2E existente. Se niega a crear otro si ya existe "__E2E__ Cliente estados" | Ídem |
| `npm run test:e2e:cleanup -- <runId>` | Borra las promociones del producto `__E2E__` creadas por la prueba anterior | Ídem |

## Integración (`tests/integration`)

`harness.mjs` crea una base PGlite con un stub mínimo de Supabase (roles `anon` /
`authenticated`, `auth.uid()`, esquema `storage`), aplica **todas** las migraciones y el
seed, y agrega usuarios sintéticos (admin, admin2, employee, sin profile). `as(rol, sql)`
ejecuta como ese rol dentro de una transacción (revertida salvo `persist: true`).
`createSyntheticOrder()` crea pedidos con `create_order` y datos inventados.

## E2E (`tests/e2e`)

- Variables: `E2E_BASE_URL` (por defecto `http://localhost:3000`), `CHROME_PATH` (por
  defecto Chrome en Windows) y `ADMIN_TEST_EMAIL` / `ADMIN_TEST_PASSWORD` (cuenta de
  **desarrollo**, solo en `.env.local`; los scripts la cargan con `--env-file`).
- Las credenciales nunca se imprimen ni aparecen en capturas (el correo se enmascara).
- Capturas en `tests/e2e/.artifacts/` (**ignorada por git**: pueden mostrar datos de clientes).
- Solo `test:e2e:order-lifecycle` crea un pedido (y únicamente con `--crear-pedido`); las
  demás suites no crean pedidos. Nunca se cambia el estado de pedidos que no creó la prueba.

## Estados de error y vacíos (`test:e2e:states`)

`tests/e2e/fault-injection.mjs` es un preload de Node que envuelve el `fetch` del servidor
hacia Supabase **solo en la instancia local que lo cargue** (nunca en producción). El modo
(`off`, `rest-down`, `all-down`, `empty`) se lee de un archivo que la suite reescribe:

```powershell
npm run build
$env:QA_FAULT_FILE = "$env:TEMPqa-fault.txt"; Set-Content $env:QA_FAULT_FILE off -NoNewline
$env:NODE_OPTIONS = "--import ./tests/e2e/fault-injection.mjs"; npx next start -p 3101
# en otra terminal, con el mismo QA_FAULT_FILE:
$env:E2E_BASE_URL = "http://localhost:3101"; npm run test:e2e:states
```

Solo bloquea o simula lecturas; no escribe en la base. Al terminar deja el modo en `off`.

## Navegadores

Las suites usan Chrome (Chromium). Safari no se prueba automáticamente: la base es
Safari 16.4+ (Tailwind 4). `storefront.mjs` simula la ausencia de
`Element.checkVisibility` (Safari < 17.4). `crypto.randomUUID` (checkout) exige contexto
seguro: en producción (HTTPS) funciona; al probar desde un teléfono por `http://IP-local`
el checkout no puede generar el id del intento.

## Reglas de datos

- Solo datos **sintéticos** en archivos versionados: nunca nombres, teléfonos ni
  direcciones de clientes reales.
- Datos de prueba en la base remota: prefijo `__E2E__`, se dejan inactivos al terminar
  (catálogo sin DELETE) o se borran si la RLS lo permite (promociones).
- Nunca `service_role`.
