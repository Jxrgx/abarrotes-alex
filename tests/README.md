# Pruebas

| Comando | Qué prueba | Requiere |
| --- | --- | --- |
| `npm test` | Unitarias (`src/**/*.test.ts`, `node --test`) | — |
| `npm run test:db` | Integración con PostgreSQL embebido (PGlite): migraciones + seed + RLS, máquina de estados de pedidos, promociones, Storage | — |
| `npm run test:e2e` | Regresión en navegador: auth, módulos del panel, tienda, búsqueda instantánea y carrito | App corriendo, Chrome, `.env.local` |
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

## Reglas de datos

- Solo datos **sintéticos** en archivos versionados: nunca nombres, teléfonos ni
  direcciones de clientes reales.
- Datos de prueba en la base remota: prefijo `__E2E__`, se dejan inactivos al terminar
  (catálogo sin DELETE) o se borran si la RLS lo permite (promociones).
- Nunca `service_role`.
