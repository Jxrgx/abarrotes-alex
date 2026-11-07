# Promociones (Fase 8D)

El MVP maneja **un solo tipo de promoción: precio promocional** de un producto en una
sucursal. Sin porcentajes, 2x1, cupones ni combos.

## Modelo

`promotions` cuelga de `branch_products` (producto + sucursal + precio normal). No guarda
`product_id` ni copia el precio normal: siempre se compara contra el precio **actual** de
`branch_products`.

| Columna | Significado |
| --- | --- |
| `promotional_price` | Precio que paga el cliente (`>= 0`) |
| `starts_at` | Inicio (inclusivo). `NULL` = sin inicio (desde siempre) |
| `ends_at` | Fin (exclusivo). `NULL` = sin fin |
| `is_active` | Interruptor manual. `false` = no se aplica, sin importar fechas |

## Semántica de vigencia (única en todo el sistema)

```
vigente ⇔ is_active
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at   IS NULL OR ends_at   >  now())
```

Ventana **semiabierta `[starts_at, ends_at)`**: empieza exactamente en `starts_at` y deja
de aplicarse exactamente en `ends_at`. La usan, sin cambios desde la Fase 2:

- la RLS pública de `promotions` (tienda, búsqueda instantánea, carrito);
- `private.priced_order_lines` dentro de `create_order` (autoridad del precio del pedido);
- el estado del panel (`promotionStatus`, `src/lib/admin/promotion-forms.ts`).

Además, la tienda y `create_order` solo aplican una promoción si
`promotional_price < precio normal`; si hubiera varias visibles, usan la menor (defensivo:
con la constraint de solapamiento ya no puede haber dos activas al mismo tiempo).

Verificado en límites exactos: `starts_at = now()` aplica; `ends_at = now()` ya no.

## Estados en el panel

| Estado | Condición (en orden) |
| --- | --- |
| **Desactivada** | `is_active = false` |
| **Vencida** | `ends_at <= ahora` (se conserva `is_active`; no se desactiva sola) |
| **Requiere revisión** | precio promocional `>=` precio normal actual (el precio normal bajó): la tienda la ignora |
| **Programada** | `starts_at > ahora`: empieza sola, sin intervención |
| **Vigente** | todo lo demás |

Siempre badge con texto. "Ahora" es la hora del servidor al cargar la página.

## Zona horaria

Las fechas se capturan con `<input type="datetime-local">` y se interpretan **siempre en
`America/Merida`** (`BUSINESS_TIME_ZONE`), nunca en la zona del navegador ni UTC:
`businessLocalToIso()` / `isoToBusinessLocal()` en `src/lib/datetime.ts`. PostgreSQL guarda
`timestamptz`. El formulario lo indica: "Horario de la sucursal (Mérida)".

## Reglas garantizadas por la base (migración `…001000`)

1. **Sin solapamiento** — exclusion constraint `promotions_no_overlap`:
   ```sql
   exclude using gist (branch_product_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
   where (is_active)
   ```
   - `NULL` = −∞/+∞ (una promoción sin fechas choca con cualquier otra activa del mismo
     producto/sucursal); misma ventana semiabierta: terminar a las 10:00 y empezar a las
     10:00 **no** es cruce. Las inactivas no cuentan.
   - Requiere la extensión estándar **`btree_gist`** (igualdad de uuid + rangos en GiST).
   - Es atómica: dos admins guardando a la vez no pueden crear un cruce (una comprobación
     previa en JavaScript tendría condición de carrera).
   - Una promoción **vencida que sigue activa** también ocupa su ventana: si empezó sin
     inicio o en el pasado, impide crear otra "sin fechas" (que incluye el pasado). El
     error lo sugiere ("…incluidas las vencidas que sigan activas"); basta desactivarla.
2. **Descuento real** — trigger `private.validate_promotion`: al crear, cambiar el precio
   promocional o **reactivar**, exige `promotional_price < branch_products.price`. Editar solo
   fechas o desactivar una promoción que quedó en "Requiere revisión" sigue permitido.
3. **Producto fijo** — el mismo trigger impide cambiar `branch_product_id`. Si el admin eligió
   mal el producto: desactivar y crear otra (historial simple).

| Código | Mensaje |
| --- | --- |
| `23P01` | "Ya existe una promoción activa que se cruza con estas fechas." |
| `PRM01` | "El precio promocional debe ser menor que el precio normal." |
| `PRM02` | "El producto de una promoción no se puede cambiar. Desactívala y crea otra." |
| `23514` | CHECK de rango (fin > inicio) o precio negativo |

## Panel `/admin/promociones`

- Listado (tabla en desktop, tarjetas en móvil): producto (con "Producto inactivo" /
  "Agotado" si aplica), precio normal actual, promocional, ahorro ($ y %), vigencia en hora
  de Mérida y estado. Búsqueda por producto, marca, categoría y subcategoría; filtro por
  estado (y por sucursal solo si hay más de una). Atajo "N requieren revisión".
- **Nueva promoción**: buscador de productos **activos** (no un `<select>` de cientos):
  campo de búsqueda + hasta 8 resultados con presentación y precio normal. Precio normal
  de solo lectura, precio promocional con ahorro en vivo, inicio y fin opcionales (con
  "Quitar fecha") y "Activa". Crear "precio $15, activa, sin fechas" es el camino directo.
- **Editar**: precio promocional, inicio, fin y activa. El producto no se cambia.
- **Desactivar** (confirmación: "Esta promoción dejará de aplicarse inmediatamente.") y
  **Activar** directo; al reactivar, la base vuelve a comprobar precio y solapamiento y,
  si falla, no se reactiva y se muestra el mensaje.
- **Sin borrar** en la UI (la RLS de admin lo permite, pero se conserva la configuración).

## Relación con el mayoreo

Promociones y precios por mayoreo ([wholesale.md](wholesale.md)) son CRUD separados. Al
cobrar gana el **mejor** precio unitario para la cantidad; en empate exacto gana la
promoción. Una promoción nunca se bloquea porque el mayoreo pueda ser mejor. El badge
«Oferta» y la sección Ofertas del inicio son solo para promociones. «Requiere revisión»
funciona igual en ambos: si el precio normal baja, la regla deja de aplicarse sin borrarse.

## Relación con la tienda

Cada mutación revalida `/admin/promociones`, `/admin/productos`, `/` y `/productos`. Como la
tienda no usa caché, la oferta aparece/desaparece en la siguiente visita en la sección
Ofertas, tarjetas y `/productos`. El carrito resuelve el precio vigente al cargarse
(`/api/carrito`) y `create_order` lo recalcula al confirmar. La búsqueda instantánea
conserva su caché de 60 s en el navegador. Una promoción programada empieza a aplicarse
sola: todas las capas evalúan `now()` en cada consulta.
