# Carrito

Carrito anónimo y persistente en el navegador. Código en
[`src/lib/cart/`](../src/lib/cart/) y [`src/components/cart/`](../src/components/cart/).

## Frontera de seguridad (leer primero)

**Nada del carrito es confiable para crear un pedido.** localStorage lo controla
el usuario: puede editar ids, cantidades o cualquier dato.

- El carrito solo guarda `productId` + `quantity`. No guarda precios, nombres ni promociones.
- Los precios que se ven en `/carrito` vienen de una consulta al servidor y son
  solo para mostrar (UX).
- Al crear el pedido (Fase 6), el servidor recibirá **únicamente ids y cantidades**
  y volverá a consultar sucursal, producto, disponibilidad, precio y promoción
  para calcular los importes. Cualquier precio enviado por el cliente se ignora.
- Las validaciones del cliente (no agregar agotados, máximo 99) evitan errores de
  UI; no sustituyen la validación del servidor.

## Formato en localStorage

Key: `abarrotes-alex:cart`

```json
{
  "version": 1,
  "branchId": "00000000-0000-4000-8000-000000000001",
  "items": [{ "productId": "…uuid…", "quantity": 2 }]
}
```

- `version`: formato del storage. Una versión desconocida se descarta (carrito vacío).
  Un cambio de formato futuro debe migrar `1 → 2` en `parseStoredCart`.
- `branchId`: sucursal a la que pertenece el carrito (null mientras no se ha usado).
- `items`: máximo 100 productos distintos; `quantity` entero de 1 a 99.

### Validación al cargar (`parseStoredCart`, Zod)

Nunca lanza un error:

| Caso                                  | Resultado                         |
| ------------------------------------- | --------------------------------- |
| JSON corrupto, no objeto, versión ≠ 1 | Carrito vacío                     |
| `productId` que no es UUID            | Se descarta ese elemento          |
| `quantity` no numérica, 0 o negativa  | Se descarta ese elemento          |
| `quantity` decimal                    | Se trunca (2.7 → 2)               |
| `quantity` > 99                       | Se recorta a 99                   |
| Producto repetido                     | Gana el primero                   |

El storage solo se reescribe en la siguiente acción del usuario.

## Estado en el cliente

- `reducer.ts`: reducer puro (`add`, `increment`, `decrement`, `setQuantity`,
  `remove`, `clear`). Devuelve el mismo objeto si nada cambia.
- `store.ts`: store externo sobre localStorage leído con `useSyncExternalStore`
  (de React, sin dependencias). Hooks: `useCart`, `useCartCount`, `useCartQuantity`.
  Se eligió en lugar de Context + reducer porque resuelve la hidratación y la
  sincronización entre pestañas sin efectos ni providers.
- `add` e `increment` reciben `available` desde la UI: un producto agotado no se
  acepta aunque se invoque la acción.
- El contador del header es la **suma de cantidades**, no los productos distintos.

### Hidratación

En el servidor y durante la hidratación el snapshot es `null` (carrito "cargando").
El HTML del servidor y el primer render del cliente coinciden, y luego React usa el
snapshot real. Mientras es `null`:

- el número del header se reserva invisible (no salta de 0 a N);
- la tarjeta muestra "Agregar" (misma altura que el control de cantidad);
- `/carrito` muestra un skeleton.

### Varias pestañas

El evento `storage` recarga el snapshot: agregar en una pestaña actualiza el
contador y las tarjetas de las demás.

## Cantidades y eliminación

- Tarjeta de producto: "Agregar" se convierte en `[−] n [+]`. En cantidad 1 el botón
  `−` se convierte en **Quitar** (icono de basura y etiqueta propia), así que
  quitar nunca es un efecto oculto de restar.
- `/carrito`: `−` se detiene en 1 y quitar es el botón **Eliminar**. La cantidad
  también se puede escribir (1–99; Enter o al salir aplica).
- **Vaciar carrito**: botón discreto con confirmación en línea ("Cancelar" recibe el foco).

## Datos actuales (`POST /api/carrito`)

`/carrito` envía `{ branchId, productIds }` y el servidor responde la información
pública actual de todos esos productos en **una sola consulta** (`getBranchProducts`
con `productIds`). Usa el cliente público con RLS, nunca `service_role`. Es de solo
lectura y no crea pedidos.

- Respuesta en **centavos enteros** (`priceCents`, `promoPriceCents`). PostgREST
  entrega `numeric` como número JSON; se convierte en el servidor con
  `Math.round(valor * 100)` y todas las sumas se hacen con enteros.
- Precio efectivo con la misma función que el catálogo (`effectivePrice` en
  `src/lib/catalog/pricing.ts`): promoción visible si existe, si no el precio.
- Solo se vuelve a consultar si aparecen ids nuevos o cambia la sucursal; cambiar
  cantidades o quitar productos no genera consultas.
- Si la consulta falla: mensaje amigable + "Reintentar". El storage no se toca.

### Estados de cada línea

| Estado            | Cuándo                                    | UI                                                       |
| ----------------- | ----------------------------------------- | -------------------------------------------------------- |
| Disponible        | Producto visible y disponible             | Precio, cantidad editable, subtotal                      |
| Agotado           | `is_available = false`                    | Badge "Agotado", sin aumentar, aviso para quitarlo       |
| Ya no disponible  | No regresó (inactivo o no está en la sucursal) | Badge "Ya no disponible" + Eliminar (no se borra en silencio) |

El subtotal general solo suma productos disponibles. "Continuar pedido" está
deshabilitado en esta fase y además exige quitar agotados y no disponibles.
No hay envío, impuestos ni total final: el envío se confirmará en el pedido.

## Multisucursal (futuro)

- El carrito pertenece a `branchId`. Si se agrega un producto desde otra sucursal,
  el carrito pasa a ella y conserva los productos; `/carrito` los revalida contra
  la nueva (precio, existencia y disponibilidad pueden cambiar).
- Si la sucursal del carrito deja de estar activa, todas las líneas quedan como
  "Ya no disponible" con un aviso.
- Cuando exista selector de sucursal, cambiar de sucursal deberá revalidar el carrito.
