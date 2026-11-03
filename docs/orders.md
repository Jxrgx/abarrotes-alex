# Pedidos — creación segura (Fase 6A)

Cómo se crea un pedido anónimo desde la tienda. La interfaz de checkout y
WhatsApp llegan en la Fase 6B; esta fase define la operación segura que usarán.

## Frontera de confianza

**El navegador no es confiable.** Del cliente solo se aceptan:

- `branchId`
- `items: [{ productId, quantity }]`
- datos del cliente y la entrega (nombre, teléfono, tipo de entrega, dirección, pago, notas)
- `clientRequestId` (idempotencia) y, opcionalmente, `expectedSubtotalCents` (solo para comparar)

El cliente **nunca** decide `unit_price`, promociones, subtotales, `total` ni
`folio`. Cualquier precio extra que envíe se ignora (Zod lo descarta y la base no
lo recibe).

## Arquitectura elegida

```
Checkout (6B) ──POST /api/pedidos──▶ Route Handler (Zod, errores comprensibles)
                                         │  supabase.rpc (llave pública)
                                         ▼
                            public.create_order(...)  SECURITY DEFINER
                            una transacción: orders + order_items + order_status_history
```

| Alternativa | Por qué no / por qué sí |
| --- | --- |
| A) Next.js + `service_role` | Sin atomicidad: cada llamada a PostgREST es una transacción distinta (pedido parcial posible). Requiere un secreto que **ignora toda la RLS**: si se filtra, la base queda expuesta. |
| **B) Función `SECURITY DEFINER` (elegida)** | Atómica por naturaleza, cálculos en `numeric`, folio de la sequence, cero secretos nuevos. Las tablas siguen **sin INSERT público ni políticas nuevas**: anon solo puede invocar esta operación cerrada. Fácil de reutilizar desde el admin. |
| C) Edge Function | Otro runtime y despliegue, y para ser atómica igual necesitaría una función SQL. |

`create_order` vive en `public` (expuesta por la API) y la pueden ejecutar `anon`
y `authenticated`. **La seguridad no depende de Next.js**: aunque alguien llame la
RPC directamente con la llave pública, la función valida todo. El Route Handler
agrega validación temprana, errores legibles y será el lugar para límites de
uso (rate limiting) en el futuro.

El advisor de Supabase marca `anon_security_definer_function_executable` para
esta función: es **intencional** (la función es la frontera). Alternativa si se
quiere eliminar ese aviso: revocar `anon`, crear una llave secreta solo de
servidor (`SUPABASE_SECRET_KEY`) y llamar la RPC con ella desde el Route Handler.

Funciones auxiliares en el esquema `private` (no expuesto por la API, sin permisos
para anon): `priced_order_lines`, `order_receipt`, `raise_order_error`.

## Atomicidad

Una llamada a una función de PostgreSQL es una sola transacción. Si cualquier paso
falla (validación, constraint de una partida, `PRICE_CHANGED`, efectivo insuficiente)
se revierte todo: **no existen pedidos parciales**. Probado con fallos después de
insertar el pedido y sus partidas.

Orden interno:

1. Idempotencia (`client_request_id`).
2. Carrito: 1–100 productos, `quantity` entera de 1 a 99, sin repetidos.
3. Datos del cliente y la entrega.
4. Sucursal activa.
5. Productos existentes en la sucursal y visibles (producto, subcategoría y categoría activos).
6. Productos disponibles (`is_available`).
7. `orders` (folio por sequence) → `order_items` (precio actual) → totales → historial `NULL → new`.

Los productos inválidos **no se eliminan en silencio**: se rechaza el pedido con
los `productIds` afectados para que el checkout pida corregir el carrito.

## Precios y promociones

- Precio efectivo por partida: la promoción **vigente de menor precio** que sea menor
  al precio normal; si no hay, `branch_products.price`. Vigente = `is_active` y dentro
  de `starts_at`/`ends_at` (misma regla que la RLS y el catálogo).
- `order_items.subtotal = round(unit_price × quantity, 2)`; `orders.subtotal` = suma
  de las partidas insertadas (los precios se leen una sola vez).
- Envío: `shipping_cost = NULL` ("por confirmar") y `total = subtotal` (total conocido).
- Todo en `numeric`. La respuesta envía montos como texto (`"1512.50"`) y Next.js los
  convierte a centavos enteros sin punto flotante.
- `expectedSubtotalCents` (opcional): si no coincide con el recalculado se rechaza con
  `PRICE_CHANGED` y el subtotal real, para que el cliente confirme el nuevo monto.

## Snapshot en order_items

Se guarda nombre, presentación formateada (`"600 ml"`, `"12 piezas"`), precio
unitario, cantidad y subtotal del momento. Cambios futuros del catálogo no alteran
pedidos (ver [database.md](database.md)).

## Folios

Los asigna PostgreSQL (`default public.next_order_folio()` sobre `order_folio_seq`):
`ALEX-000001`, `ALEX-000002`… Nunca en JavaScript. Un intento revertido consume un
número (huecos normales de una sequence).

## Idempotencia (doble clic / reintentos)

- `orders.client_request_id uuid UNIQUE` (migración `…000400`).
- El checkout genera un UUID por **intento de pedido** y lo reutiliza en los reintentos.
- Mismo id → se devuelve el pedido existente (`replayed: true`, HTTP 200) sin crear otro.
- Dos peticiones simultáneas con el mismo id: la segunda espera al índice único,
  captura `unique_violation` y devuelve el pedido ganador. Probado en el remoto.
- Limitación: el reintento no compara el contenido; un mismo id con otro carrito
  devuelve el pedido original. El checkout debe generar un id nuevo si el carrito cambia.

## Validaciones (servidor y base)

| Campo | Regla |
| --- | --- |
| `customer.name` | 2–120 caracteres (recortado) |
| `customer.phone` | se normaliza a dígitos; 10–15 dígitos |
| `delivery.type` | `pickup` o `delivery` |
| `delivery.address` / `neighborhood` | obligatorios con `delivery` (≤300 / ≤120); con `pickup` no se guardan |
| `delivery.references` | opcional, ≤300 |
| `payment.method` | solo `cash` por ahora |
| `payment.cashAmountCents` | opcional, > 0, ≤ 99 999.99 y **≥ subtotal** |
| `notes` | opcional, ≤500 (vacío → NULL) |

Zod en el Route Handler da errores tempranos; la función repite las reglas porque
puede invocarse directamente; los constraints de la tabla son la última línea.

## Errores

`POST /api/pedidos` responde `{ error: { code, message, productIds?, fields?, subtotalCents? } }`.

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `CART_EMPTY` | 400 | Sin productos |
| `INVALID_CART` | 400 | Formato inválido, repetidos o más de 100 productos |
| `INVALID_QUANTITY` | 400 | Cantidad fuera de 1–99 o decimal (`productIds`) |
| `INVALID_CHECKOUT_DATA` | 400 | Datos del cliente/entrega/pago inválidos (`fields`, p. ej. `customer.phone`) |
| `BRANCH_UNAVAILABLE` | 409 | Sucursal inexistente o inactiva |
| `PRODUCT_UNAVAILABLE` | 409 | Producto inexistente, inactivo o no asignado a la sucursal (`productIds`) |
| `PRODUCT_OUT_OF_STOCK` | 409 | Producto agotado (`productIds`) |
| `PRICE_CHANGED` | 409 | El subtotal esperado no coincide (`subtotalCents` real) |
| `INTERNAL_ERROR` | 500 | Cualquier otro fallo |

Nunca se exponen SQL, stack traces ni nombres internos. En la base los errores de
negocio usan SQLSTATE `P0001` con el código en `MESSAGE` y contexto JSON en `DETAIL`.
El reintento con el mismo id no es un error: devuelve el pedido (HTTP 200).

## Respuesta exitosa

HTTP 201 (200 si `replayed`):

```json
{ "order": {
  "orderId": "…", "folio": "ALEX-000001", "status": "new", "createdAt": "…",
  "deliveryType": "pickup", "paymentMethod": "cash",
  "subtotalCents": 10000, "shippingCents": null, "totalCents": 10000, "replayed": false,
  "branch": { "name": "…", "whatsappNumber": "52…" },
  "items": [{ "productId": "…", "name": "Refresco de cola", "presentation": "600 ml",
              "unitPriceCents": 1500, "quantity": 3, "subtotalCents": 4500 }]
} }
```

Incluye lo necesario para la confirmación y el mensaje de WhatsApp. No incluye
nombre, teléfono ni dirección del cliente (el checkout ya los tiene).

## Privacidad

- `orders`, `order_items` y `order_status_history` siguen **sin políticas**: anon y
  authenticated no pueden leerlas ni escribirlas (verificado en el remoto).
- Con `pickup` no se guarda dirección aunque se envíe.
- Los logs solo registran códigos de error, nunca el request (contiene datos personales).

## Relación con 6B (checkout y WhatsApp)

1. Generar `clientRequestId` al iniciar el intento y conservarlo en reintentos.
2. Enviar `expectedSubtotalCents` con el subtotal mostrado; ante `PRICE_CHANGED`,
   mostrar el nuevo monto y pedir confirmación.
3. Ante `PRODUCT_UNAVAILABLE` / `PRODUCT_OUT_OF_STOCK`, marcar esos `productIds` en
   el carrito para que el usuario los quite.
4. Con la respuesta, mostrar la confirmación, armar el mensaje de WhatsApp con
   `folio`, partidas y `branch.whatsappNumber`, y vaciar el carrito.

## Pruebas

- PGlite (PostgreSQL embebido): 71 casos de `create_order` ejecutados como `anon` en
  transacciones revertidas (válido, idempotencia, cada error, promociones, rollback, RLS).
- Remoto: prueba dentro de un bloque `DO` que se revierte, y E2E de `POST /api/pedidos`
  con pedidos de prueba que se borraron explícitamente; la sequence se reinició porque
  no quedaba ningún pedido.
