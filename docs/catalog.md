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

## Búsqueda

- Explícita (Enter), sin resultados instantáneos ni autocompletado.
- Cada palabra (máx. 5) debe coincidir **al inicio de una palabra** del nombre del
  producto o de su marca: `cola` encuentra "Refresco de cola", pero `late` no encuentra
  "chocolate". Se usa `ILIKE` (insensible a mayúsculas, también acentuadas en la
  collation `en_US.UTF-8` de Supabase).
- El texto se normaliza (NFC) y solo conserva letras, números, espacios, `-`, `.` y `'`;
  así no llegan caracteres con significado en los filtros de PostgREST.
- **Desde el header**: en `/productos` la búsqueda conserva categoría, subcategoría,
  marca y orden (los filtros activos quedan visibles como chips y el estado vacío
  ofrece "Buscar en todos los productos"). Desde cualquier otra página empieza una
  búsqueda nueva en `/productos?q=…`.
- **Pendiente**: búsqueda sin acentos (`jabon` → "Jabón"). Requiere la extensión
  `unaccent` (disponible en Supabase, no instalada), es decir, una migración.

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
