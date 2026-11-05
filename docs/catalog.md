# Catálogo público — búsqueda y filtros

`/productos` obtiene los resultados en el servidor a partir de la URL. La URL es
la única fuente de verdad: recargar, compartir y atrás/adelante conservan el estado.

## Search params

| Param          | Valores                         | Ejemplo                                   |
| -------------- | ------------------------------- | ----------------------------------------- |
| `q`            | texto libre (máx. 60)           | `/productos?q=cola`                       |
| `categoria`    | slug de categoría               | `/productos?categoria=bebidas`            |
| `subcategoria` | slug **dentro** de la categoría | `/productos?categoria=bebidas&subcategoria=refrescos` |
| `marca`        | slug de marca                   | `/productos?marca=burbuja`                |
| `orden`        | `precio-asc`, `precio-desc`     | `/productos?q=cola&orden=precio-asc`      |

Todos se combinan (intersección). La lógica pura vive en
[`src/lib/catalog/filters.ts`](../src/lib/catalog/filters.ts) (`parseCatalogParams`,
`resolveCatalogFilters`, `catalogHref`), compartida por servidor y cliente.

## Reglas de resolución

- **Parámetros inválidos se ignoran, no redirigen**: categoría o marca inexistente,
  orden desconocido y `q` vacío se omiten. Si se omitió algo, la página muestra
  un aviso discreto ("Omitimos filtros no válidos: …"). Los enlaces que genera la
  interfaz ya no incluyen esos parámetros. Si un parámetro se repite, se usa el primero.
- **Subcategoría**: el slug es único solo dentro de su categoría, así que se
  resuelve con `(categoria, subcategoria)`. Sin una categoría válida, o si no
  pertenece a ella, **se ignora** (no se adivina la categoría).
- **Cambiar de categoría** (chips o panel móvil) descarta la subcategoría y
  conserva búsqueda, marca y orden.
- **Marca**: global. Sin filtro de marca aparecen también los productos sin marca
  (`brand_id` NULL); el embed de `brands` nunca usa `!inner`.
- **Quitar un chip** elimina solo ese filtro. Quitar la categoría también quita la subcategoría.
- **Limpiar filtros** quita búsqueda, categoría, subcategoría y marca; conserva el orden.

## Búsqueda completa (`/productos?q=`)

- Server-side en PostgreSQL; se combina con categoría, subcategoría, marca y orden.
- Cada palabra (máx. 5) debe coincidir **al inicio de una palabra** del nombre del
  producto, de su marca, de su subcategoría o de su categoría: `cola` encuentra
  "Refresco de cola" (pero `late` no encuentra "chocolate"); `lacteos` encuentra los
  productos de "Lácteos".
- **Sin acentos** (Fase 4C): el nombre se busca en `products.search_name`, columna
  generada con `unaccent` + minúsculas (migración `…000600`); el término se normaliza
  igual en la aplicación (`normalizeSearchText`: NFD sin diacríticos + minúsculas).
  `jabon`, `JABÓN` y `jabón` encuentran "Jabón". Nota: el diccionario de `unaccent`
  también convierte **ñ → n**, así que en el catálogo `pena` encuentra "Peña" (aceptable
  para buscar productos). La búsqueda de pedidos del panel sí distingue la ñ (ver orders.md). Marcas, subcategorías y categorías se
  comparan con la misma normalización en el servidor (sus ids van en el `or`).
- El texto se normaliza (NFC) y solo conserva letras, números, espacios, `-`, `.` y `'`;
  así no llegan caracteres con significado en los filtros de PostgREST.
- **Desde el header**: en `/productos` la búsqueda conserva categoría, subcategoría,
  marca y orden (los filtros activos quedan visibles como chips y el estado vacío
  ofrece "Buscar en todos los productos"). Desde cualquier otra página empieza una
  búsqueda nueva en `/productos?q=…`.

## Búsqueda instantánea (Fase 4C)

Autocomplete del campo "Buscar productos..." con **Fuse.js 7.5.0**. Es una mejora
progresiva: la búsqueda completa de arriba sigue existiendo y es la que se usa con
Enter o "Ver todos".

```
GET /api/busqueda (cliente público, 1 consulta) → índice ligero → Fuse.js en el navegador → ≤ 6 resultados
```

- **Índice** (`LiveSearchItem`): id, slug, nombre, presentación, marca, categoría y
  subcategoría (nombre y slug), `image_path`, precio y precio promocional en centavos,
  disponibilidad. Sin datos administrativos ni de pedidos. ~350 bytes por producto
  (12 productos ≈ 4 KB). Se pide **una vez por visita** al enfocar el campo; caché
  `public, max-age=60`. No hay consultas por tecla.
- **Normalización**: minúsculas, sin acentos y puntuación como espacio
  (`"Coca-Cola"` → `"coca cola"`) solo para comparar; el texto mostrado no cambia.
- **Configuración** (`src/lib/catalog/live-search.ts`): pesos nombre 0.55, marca 0.25,
  subcategoría 0.15, categoría 0.05; `threshold` 0.4 con `ignoreLocation` para tolerar
  errores (`cocacla`, `japnes`); después solo se conservan resultados con score
  ≤ mejor + 0.15 (`RELATIVE_SCORE_WINDOW`), lo que elimina coincidencias lejanas
  (`coca` ya no trae "Cacahuate"). Mínimo **2 caracteres**, máximo **6 resultados**.
- **Resultados**: miniatura/placeholder, nombre + presentación, marca, precio efectivo
  (misma `effectivePrice` del catálogo) con el anterior tachado si hay oferta, y
  "Agotado" cuando corresponde. Sin controles de carrito.
- **Elegir un resultado** → `/productos?producto=<id>`: la tarjeta se desplaza al
  centro y se resalta ~2.4 s (`ProductFocus`). `producto` es solo ayuda visual (UUID
  validado; uno inválido se ignora; no filtra ni cambia precios). Desde `/productos`
  se conservan los filtros que no excluyen al producto (misma categoría,
  subcategoría o marca) y el orden; `q` se descarta porque Fuse es difuso y la
  búsqueda completa podría no incluir el resultado.
- **Teclado** (patrón combobox de WAI-ARIA, `aria-activedescendant` + listbox):
  ↓/↑ recorren las opciones (circular, incluida "Ver todos"); Enter abre la opción
  activa o, sin opción activa, hace la búsqueda completa (nunca elige la primera
  sola); Esc cierra y deja el foco en el campo; Tab no se intercepta. Clic o toque
  fuera cierra. Los cambios de resultados se anuncian en una región `aria-live`.
- **Si el índice falla**, el panel solo ofrece "Ver todos" y Enter sigue llevando a
  `/productos?q=…`.
- **Escala**: pensado para 100–500 productos (≈ 175 KB sin comprimir en el peor caso).
  Con un catálogo mucho mayor habría que buscar en el servidor por tecla.
- **Fuzzy vs. completa**: Fuse tolera errores (`cocacla` → Coca-Cola); PostgreSQL no.
  Ambas ignoran acentos y mayúsculas, así que `jabon` encuentra lo mismo en las dos.

## Consultas

- Una consulta de productos por página con todos los filtros aplicados en
  PostgreSQL (categoría, subcategoría, marca y términos de búsqueda sobre el embed `product`).
- Para buscar por marca se resuelven en el servidor los ids de marcas cuyo nombre
  coincide (la lista de marcas ya se carga para el filtro) y se usan en un `or`.
- Una consulta ligera de facetas (`brand_id`, `subcategory_id` de los productos de la
  sucursal) para ofrecer solo subcategorías y marcas con productos.
- **Orden por precio efectivo** (`promotional_price` si hay promoción visible, si no
  `price`): se hace en el servidor de Next.js después de la consulta. El precio
  promocional viene de otra tabla filtrada por RLS; con cientos de productos ordenar
  en memoria es más simple que una vista o función SQL. Desempate por nombre.

## Interfaz

- **Desktop**: chips de categoría y subcategoría (enlaces), chips de filtros activos y
  selects de Marca y "Ordenar por" que aplican al cambiar.
- **Móvil**: chips de categoría/subcategoría deslizables y botón **Filtros** que abre
  un panel inferior (`<dialog>` nativo: foco atrapado, Esc cierra, el foco vuelve al
  botón). Los cambios se aplican con "Ver resultados".
- Client Components: `SearchField` (header), `DesktopFilterControls`,
  `MobileFilterButton` y `PendingHint` (spinner mientras navega un enlace). El resto
  de la página es Server Component.
