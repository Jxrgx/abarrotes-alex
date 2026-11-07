# Precios por mayoreo

Precio unitario especial según la cantidad que se compra de **un producto en una
sucursal**. Migración: `supabase/migrations/20261108000100_wholesale_prices.sql`.

```
Precio normal $22.00
3–5 pzas   → $20.00 c/u
6–11 pzas  → $18.50 c/u
12+ pzas   → $17.00 c/u
```

## Reglas de negocio

| Regla | Detalle |
| --- | --- |
| Pertenencia | `wholesale_prices.branch_product_id` (producto + sucursal): listo para multisucursal |
| Niveles | 0, 1 o varios por producto-sucursal (máx. 10 por guardado del panel) |
| Rangos | `min_quantity` 2–99; `max_quantity` NULL = **sin límite**, o entre `min` y 99 (99 = máximo por producto en carrito y pedido) |
| Huecos | Permitidos: `3–5` y `10+` es válido (6–9 pagan el mejor precio sin mayoreo) |
| Solapamiento | Prohibido en la base (exclusion constraint `int4range(min, max, '[]')`) |
| Precios no crecientes | A mayor cantidad, precio **igual o menor** (constraint trigger) |
| Precio | `> 0` y **menor que el precio normal** al crear o cambiar el precio del nivel |
| Toda la partida | Al alcanzar un nivel, su precio aplica a **todas** las unidades: 3 × $20 = $60, no 2 × $22 + 1 × $20 |
| Cantidad que decide | La de **esa línea**: no se suman productos distintos ni sucursales |
| Solo por unidad | `sale_type = 'unit'`. Por peso: la base rechaza niveles (`WHL02`) y el cálculo los ignora |

## Precio efectivo (regla única)

> **El cliente siempre recibe el mejor precio unitario disponible para su cantidad.**

```
precio(q) = min( normal,
                 promoción vigente (si < normal),
                 nivel de mayoreo cuyo rango contiene q (si < normal) )
```

- **Autoridad:** `private.line_price(branch_product_id, quantity)` en PostgreSQL. La usa
  `private.priced_order_lines` → `create_order`. No hay otra implementación del cobro.
- **Espejo para presentación:** `resolveUnitPrice()` en `src/lib/catalog/pricing.ts`
  (tarjeta, carrito, checkout). `tests/integration/wholesale.test.mjs` compara SQL y
  TypeScript para las cantidades 1–99 en cada escenario (sin promoción, escalones, huecos,
  promoción + mayoreo, empate).
- **Empate exacto promoción = mayoreo → `promotion`** (determinista: la oferta es la
  comunicación más visible y no cambia al subir la cantidad).
- **Una unidad (catálogo):** `catalog_items.effective_price` sigue siendo
  `min(normal, promoción)`. «Precio menor/mayor» ordena por el precio de **1 unidad**,
  nunca por el mayoreo mínimo posible (normal $22, 12+ $15 → ordena con $22).

| Normal 22 · Oferta 19 · Mayoreo 3–5 $20 · 6+ $18 | Precio | `pricing_type` |
| --- | --- | --- |
| 1 | $19 | promotion |
| 3 | $19 | promotion (el mayoreo $20 no mejora la oferta) |
| 6 | $18 | wholesale |

## Cambio del precio normal («Requiere revisión»)

Mismo patrón que las promociones (Fase 8D):

- Se **puede** bajar el precio normal aunque un nivel quede igual o por encima.
- Ese nivel no se borra: queda **«Requiere revisión»** y **deja de aplicarse**. La tienda
  no lo ve (RLS y vista filtran `unit_price < price`) y `create_order` no lo cobra.
- Editar el rango de ese nivel o quitarlo sigue permitido; cambiar su precio exige que
  vuelva a ser menor que el normal (`WHL01`).
- En el panel: aviso ámbar en el editor y «Mayoreo: requiere revisión» en el listado.

## Base de datos

| Objeto | Función |
| --- | --- |
| `public.wholesale_prices` | Niveles (`ON DELETE CASCADE` desde `branch_products`: sin huérfanos) |
| `wholesale_prices_no_overlap` | Exclusion constraint GiST, `DEFERRABLE INITIALLY IMMEDIATE` |
| `private.validate_wholesale_price()` | BEFORE: producto fijo (`WHL04`), solo por unidad (`WHL02`), precio < normal (`WHL01`) |
| `wholesale_prices_decreasing` | Constraint trigger (deferrable): precios no crecientes (`WHL03`). Bloquea la fila de `branch_products` con `FOR UPDATE`: dos admins simultáneos se serializan y el segundo ve lo que confirmó el primero |
| `public.pricing_type` | Enum `normal` · `promotion` · `wholesale` |
| `order_items.pricing_type` | Snapshot de la regla cobrada. NULL solo en partidas anteriores a la migración; `CHECK … NOT VALID` lo exige en toda partida nueva |
| `private.line_price()` | Regla única de precio por cantidad |
| `catalog_items.wholesale_tiers` | `[{ "min": 3, "max": 5, "price": 20.00 }, …]`, solo niveles aplicables de productos por unidad |

**RLS:** público (anon/authenticated) lee solo niveles aplicables de productos visibles;
admin hace CRUD. Employee, sin profile y anon no escriben (además, `REVOKE` de escrituras
a anon y sin `TRUNCATE`). Sin `service_role`.

## Panel (Crear/Editar producto)

- Sección **«Precios por mayoreo»** (*Define precios especiales según la cantidad
  comprada.*), con **+ Agregar precio por mayoreo**.
- Cada nivel: **Desde**, **Hasta** (o casilla **Sin límite**) y **Precio por pieza**.
- Retroalimentación: precio normal, «3–5 pzas → $20.00 c/u · Ahorro $2.00 por pieza
  (9.1 %)».
- Mensajes: «El precio por mayoreo debe ser menor que el precio normal.» · «Este rango se
  cruza con otro precio por mayoreo.» · «La cantidad final debe ser igual o mayor que la
  inicial.» · «Un nivel para una cantidad mayor no puede tener un precio superior al nivel
  anterior.» (validación local + códigos de la base traducidos; nunca SQL).
- Por peso: el editor se oculta con explicación; si había niveles se avisa que se
  eliminarán al guardar.
- **Guardado atómico:** `admin_save_product` (misma firma) acepta en cada sucursal
  `"wholesale": [{ id|null, min_quantity, max_quantity, unit_price }]`. Producto + precio +
  niveles en una transacción. Con la clave: los niveles no enviados se borran, los enviados
  con id se actualizan **solo si cambiaron** (así un nivel intacto por encima del nuevo
  precio no bloquea el guardado) y los nuevos se insertan. Solapamiento y orden se verifican
  al final (`SET CONSTRAINTS … IMMEDIATE`), lo que permite reacomodar rangos en un solo
  guardado. Sin la clave, los niveles no se tocan.
- Duplicar copia los niveles como nuevos. Promociones y mayoreo siguen siendo CRUD
  separados.

## Tienda

- **Tarjeta:** una línea compacta `primary-soft` con icono Tag y la palabra **Mayoreo**
  visible. Solo el primer nivel que **mejora el precio de 1 unidad**:
  - fuera del carrito o cantidad 1: «Mayoreo desde 3 pzas · $20.00 c/u» (o «de 3 a 5
    pzas» si es un único rango acotado);
  - cantidad 2: «Mayoreo: agrega 1 más y paga $20.00 c/u»;
  - al alcanzarlo: «Mayoreo aplicado · $20.00 c/u»;
  - dentro de un nivel con uno mejor: «Mayoreo: agrega 2 más y paga $18.50 c/u».

  Informativo, sin urgencia ni colores agresivos. «Oferta» queda reservado a promociones.
  Agotados muestran el mayoreo pero no se pueden agregar; inactivos no aparecen. Si la
  oferta ya es mejor que todo el mayoreo, no se muestra.
- **Accesibilidad:** la región `aria-live` del carrito anuncia solo los cambios de precio
  («Precio mayoreo aplicado: $20.00 cada uno.» / «Ya no aplica el precio mayoreo.»), no
  cada clic.
- **Home:** «Ofertas» siguen siendo solo promociones; destacados y demás muestran su línea
  de mayoreo.

## Carrito, checkout y pedido

- El carrito guarda solo `productId` + `quantity`. `POST /api/carrito` devuelve, en la
  misma consulta por lote, los niveles aplicables; el navegador calcula el precio por
  cantidad con `resolveUnitPrice` **al instante** (2 → 3 cambia a $60 sin otra petición).
- Línea: «$20.00 c/u ~~$22.00~~» + badge **Mayoreo**, subtotal y «Agrega N más para
  obtener $X c/u» si existe un nivel mejor.
- Checkout: mismo precio por cantidad; badge discreto «Mayoreo · $17.00 c/u».
- `create_order` recibe exactamente lo mismo que antes (ids, cantidades, datos de
  checkout). Cualquier `unit_price`, `pricing_type` o `wholesale_price` del navegador se
  **ignora**. `PRICE_CHANGED` devuelve el subtotal recalculado con la regla nueva si cambió
  el precio normal, la promoción o el mayoreo.
- Comprobante y `/pedido/[folio]`: snapshot (`pricing_type` por partida), «Precio mayoreo
  · $20.00 c/u». No se consultan reglas actuales. WhatsApp usa los importes del
  comprobante.
- Panel → detalle del pedido: badge «Mayoreo» / «Oferta» por partida (snapshot).

## Pruebas

- `npm test`: `src/lib/catalog/wholesale.test.ts` (regla, stepper 1→2→3→2→6→12,
  textos, carrito persistido sin precios, formulario).
- `npm run test:db`: `tests/integration/wholesale.test.mjs` (constraints, RLS, cascada,
  revisión, paridad SQL = TS 1–99, `create_order`, `PRICE_CHANGED`, idempotencia,
  `admin_save_product`) y `catalog-view.test.mjs` (1600 productos con mayoreo, paginación
  sin N+1).
- `npm run test:e2e:wholesale`: navegador sobre el catálogo **sintético** del modo
  `fixture` (ver tests/README.md); no crea datos.

## Despliegue

**Aplicar la migración ANTES de desplegar la app.** El código nuevo pide
`catalog_items.wholesale_tiers` y `order_items.pricing_type`: sin la migración, el
catálogo y el detalle de pedidos fallarían (`42703`). La migración es compatible con la
app anterior (misma firma de `create_order`/`admin_save_product`; la vista solo agrega una
columna al final).
