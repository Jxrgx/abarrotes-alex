# Checkout, confirmación y WhatsApp (Fase 6B)

Flujo: **Carrito → `/checkout` → `POST /api/pedidos` → `/pedido/[folio]` → WhatsApp.**
La creación del pedido (validación, precios, folio, atomicidad) está en
[orders.md](orders.md); este documento cubre la experiencia del cliente.

## Arquitectura

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| `/checkout` | `src/app/(tienda)/checkout/page.tsx` | Shell de servidor; carga la sucursal y su horario para "Recoger en sucursal". |
| `CheckoutView` | `src/components/checkout/checkout-view.tsx` | Client Component: carrito + precios actuales (`/api/carrito`) + formulario (React Hook Form + Zod) + resumen + envío. |
| Reglas del formulario | `src/lib/orders/checkout-form.ts` | Esquema, teléfono MX, montos en centavos, cuerpo del request, huella del carrito. |
| Estado temporal | `src/lib/orders/session.ts` | `sessionStorage`: intento de pedido y comprobantes. |
| WhatsApp | `src/lib/orders/whatsapp.ts` | Único lugar que arma el mensaje y el enlace `wa.me`. |
| `/pedido/[folio]` | `src/components/checkout/order-confirmation.tsx` | Confirmación a partir del comprobante en `sessionStorage`. |

## Formulario

Una sola página con secciones numeradas que orientan, sin bloquear ni navegar. **Domicilio**: 1 Entrega → 2 Tus datos (nombre y teléfono) → 3 Dirección de entrega → 4 Pago → 5 Comentarios. **Recoger en sucursal** (el flujo más corto): 1 Entrega (con sucursal, dirección y horario) → 2 Tus datos (nombre y teléfono) → resumen (con "Recoger en", dirección y horario) → Confirmar pedido. Sin dirección, pago ni comentarios. Al cambiar a recoger se limpian los errores de esos campos (`DELIVERY_ONLY_FIELDS`); lo escrito se conserva por si vuelve a domicilio, pero **nunca se envía** en un pedido para recoger. En móvil, arriba se recuerda "N productos · $X + envío · Editar"; el resumen completo y "Confirmar pedido" quedan al final, con la nota "Después podrás enviarlo por WhatsApp a Abarrotes Alex." (asociada al botón con `aria-describedby`). Los campos tienen `scroll-margin-top` para que, al enfocar un error, no queden bajo el header fijo. WhatsApp nunca se abre solo: es la acción principal de la confirmación ("Último paso").

| Campo | Regla (cliente) | Notas |
| --- | --- | --- |
| Nombre * | 2–120 caracteres | `autocomplete="name"` |
| Teléfono * | 10 dígitos MX (también al recoger); acepta espacios, guiones, `+52`/`521` | Se envía normalizado a 10 dígitos. `type="tel"` |
| Tipo de entrega * | Domicilio (default) o Recoger | Radios accesibles en tarjetas |
| Dirección * / Colonia * | Obligatorias con domicilio (≤300 / ≤120) | `address-line1`, `address-level3` |
| Referencias | Opcional, ≤300 | |
| Pago | Solo a domicilio: efectivo, sin opciones deshabilitadas | Al recoger no se muestra; el pedido va como `cash` ("Efectivo al recoger" en confirmación y WhatsApp) |
| ¿Con cuánto pagarás? | Solo a domicilio. Opcional; `$500`, `1,250.50`…; ≥ total parcial | `inputMode="decimal"`; muestra "Cambio aproximado" (solo UX) |
| Indicaciones para la tienda | Solo a domicilio. Opcional, ≤500 con contador | No es un mecanismo de sustitución automática |

Con "Recoger en sucursal" los campos de domicilio se ocultan y **no se envían**; se
muestra la sucursal, su dirección y horario. Los datos del formulario no se guardan
en ningún storage mientras se llena (privacidad); si el usuario sale, el carrito sigue.

Errores inline en español; el primer campo inválido recibe el foco. Los errores de
campo que devuelve el servidor (`INVALID_CHECKOUT_DATA` + `fields`) se muestran junto
al campo correspondiente, nunca el código.

## Resumen

Productos con cantidad e importe (precios actuales del catálogo), **Subtotal**,
**Envío: Por confirmar** y **Total parcial** (no "Total", para no sugerir envío $0).

## clientRequestId

- Se obtiene al enviar con `getCheckoutAttemptId(huella)`, donde la huella es
  sucursal + productos + cantidades. Se guarda en `sessionStorage`.
- **Misma huella → mismo id**: doble clic, error de red y reintento, e incluso
  recargar la página usan el mismo id. Si el pedido sí se creó, el servidor devuelve
  el original (idempotencia), no uno nuevo.
- **Id nuevo** cuando cambia la huella (producto, cantidad o sucursal), después de
  `PRICE_CHANGED` (el usuario confirma un monto distinto) y después de un éxito.
- Cambiar nombre, dirección o notas **conserva** el id: con ese id el pedido no se
  creó (error definitivo) o ya existe (error de red). En el segundo caso el servidor
  devuelve el pedido original con los datos originales; es la opción segura frente
  a duplicar el pedido.
- Mientras se procesa, el botón queda deshabilitado ("Procesando pedido...") y un
  candado evita un segundo envío. La idempotencia del servidor es la garantía final.

## Manejo de errores

| Respuesta | Qué ve el cliente | Qué pasa |
| --- | --- | --- |
| Error de red / respuesta ilegible | "No pudimos confirmar si tu pedido se registró…" + **Intentar de nuevo** | Mismo `clientRequestId`. El carrito no se toca. |
| `PRICE_CHANGED` | "Los precios de tu carrito cambiaron. El nuevo total parcial es $X…" | Se revalidan precios; id nuevo; **no** se reenvía solo: el usuario vuelve a confirmar. |
| `PRODUCT_OUT_OF_STOCK` / `PRODUCT_UNAVAILABLE` | Lista de productos afectados + **Revisar carrito** | Se revalida el carrito; el botón queda bloqueado hasta quitarlos (no se eliminan en silencio). |
| `BRANCH_UNAVAILABLE` | "La sucursal seleccionada no está disponible en este momento." | Botón deshabilitado; no se reintenta. |
| `INVALID_CHECKOUT_DATA` | Error junto a cada campo | Si no hay campos mapeables: mensaje general. |
| `CART_EMPTY` / `INVALID_CART` / `INVALID_QUANTITY` | Mensaje + Revisar carrito | |
| `INTERNAL_ERROR` | "No pudimos registrar tu pedido…" | Mismo id para reintentar. |

## Éxito y vaciado del carrito

Al recibir `201`/`200` con `order`, **en este orden**:

1. Guardar el comprobante en `sessionStorage` (`abarrotes-alex:order-confirmations`).
2. Limpiar el intento (`clientRequestId`).
3. **Vaciar el carrito** — solo aquí, después del éxito confirmado. Nunca antes ni ante errores.
4. Navegar con `router.replace` a `/pedido/[folio]` (Atrás no regresa al checkout).

El header queda en 0 y `/carrito` muestra el estado vacío.

## Confirmación y privacidad

- `orders` **no** es legible públicamente y no existe ningún endpoint de lectura de
  pedidos. La confirmación **no consulta la base**.
- El detalle (productos, importes, sucursal, entrega, pago) sale del comprobante
  devuelto por `create_order` y guardado en `sessionStorage` de esa pestaña: es la
  "prueba de posesión". Sobrevive a recargar la página; desaparece al cerrar la pestaña.
- Sin comprobante (otro dispositivo, otra sesión o folio escrito a mano) se muestra
  "Tu pedido ya fue registrado. Conserva tu folio para cualquier aclaración." sin
  ningún detalle. La respuesta es idéntica para cualquier folio: no hay enumeración.
- Se guardan como máximo 5 comprobantes. Incluyen nombre y, si aplica, dirección,
  porque se necesitan para el mensaje de WhatsApp; nunca se usa `localStorage` para ellos.

## WhatsApp

- `buildOrderWhatsAppMessage(receipt, contact)` arma el mensaje: folio, partidas
  (`2 × Refresco de cola 600 ml — $30.00`), Subtotal, Envío por confirmar, Total
  parcial, entrega (domicilio con dirección/colonia/referencias o sucursal), pago en
  efectivo ("Pagaré con") y comentarios.
- Los importes salen **del comprobante del pedido creado**, no del carrito (que ya se vació).
- No incluye datos técnicos (UUIDs, `clientRequestId`, status, ids de producto).
- `buildWhatsAppUrl(número, mensaje)` → `https://wa.me/<solo dígitos>?text=<encodeURIComponent>`.
  El número es `branch.whatsappNumber` de la respuesta segura; no está escrito en código.
- WhatsApp **no** se abre solo: botón explícito "Enviar pedido por WhatsApp"
  (`target="_blank"`), después de ver el folio. Si no hay número válido, se pide
  contactar a la sucursal con el folio. El pedido es válido aunque no se envíe.

## Pruebas

- `npm test` (`node --test`, sin dependencias): `whatsapp.test.ts` y
  `checkout-form.test.ts` (31 casos: mensaje, codificación con acentos/ñ/saltos/$/&,
  teléfono, montos, validaciones, cuerpo del request, huella).
- E2E en navegador (Chrome) contra el servidor de producción y Supabase remoto:
  validaciones, errores simulados del servidor, red caída + reintento con el mismo
  id, doble clic, éxito real (domicilio y recoger), vaciado, refresh, confirmación
  sin comprobante. Los pedidos de prueba se borraron y la sequence se reinició.
