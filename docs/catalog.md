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
| `page`         | entero ≥ 1 (24 por página)      | `/productos?q=cola&categoria=bebidas&page=2` |

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
- **`page`** no forma parte de los filtros (`CatalogFilters`): cualquier enlace o cambio de
  búsqueda, categoría, subcategoría, marca u orden vuelve a la **página 1**. Solo la
  paginación agrega `page` (`catalogHref(filtros, página)`). Inválido (`abc`, `0`, `-3`,
  `1.5`, enorme) → página 1; repetido → el primero; mayor que el total → «Esta página no
  existe» con enlaces a la primera y la última (nunca 500).

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
- **Regla de coincidencia (final)**: cada término, normalizado (minúsculas, sin acentos),
  debe aparecer **al inicio de una palabra** de `search_name` (`term*`, `* term*` o
  `*-term*`), o ser el inicio de una palabra del nombre de su marca, subcategoría o
  categoría. Términos combinados con AND. `coca` → "Coca-Cola"; `cola` → "Refresco de
  cola" y "Coca-Cola", **nunca** "chocolate"; `jabon` → "Jabón"; `lacteos` → productos
  de "Lácteos". Sin tolerancia a errores de escritura (decisión: se eliminó Fuse.js).

## Búsqueda en el grid (sin dropdown)

El buscador del header (`SearchField`) es un input normal que **filtra el grid**; no hay
sugerencias, panel ni overlay (se eliminó la búsqueda instantánea con Fuse.js y su índice
`GET /api/busqueda`, que descargaba el catálogo completo al navegador).

```
input → debounce 250 ms → URL (?q=…, página 1) → Server Component consulta UNA página → grid
```

- **En `/productos`**: filtra en vivo desde el primer carácter, sin Enter ni botón. La
  primera búsqueda crea una entrada de historial (Atrás vuelve al listado sin buscar);
  seguir escribiendo la **reemplaza** (no una entrada por tecla). Se conservan
  categoría, subcategoría, marca y orden; la página vuelve a 1.
- **Desde el inicio u otras páginas**: con 2 o más caracteres útiles navega a
  `/productos?q=…` (una sola tecla no navega). El header es del layout: el input no se
  remonta y **conserva foco, texto y teclado** al cambiar de página.
- **Enter / "buscar" del teclado**: aplica sin esperar el debounce y cierra el teclado.
- **Vaciar el campo** quita `q`.
- **URL → input**: Atrás/Adelante, chips y "Limpiar" actualizan el texto. Si el cambio
  de URL lo produjo el propio campo, no se pisa lo que el usuario siguió escribiendo
  (estado `sentQ`); no hay bucles entre estado local, router y search params.
- **Transición**: la navegación va en `useTransition`; el grid anterior se queda visible
  y atenuado con "Actualizando…" (`CatalogResults` + `navigation-pending.ts`), sin
  skeleton en cada tecla. El conteo (`role="status"`) anuncia el nuevo total.
- **Móvil/Safari**: sin overlays ni sheets para buscar; el input conserva el foco (no se
  recrea) y `scroll: false` evita saltos mientras se escribe en el catálogo.

## Paginación

- **24 por página** (`CATALOG_PAGE_SIZE`): múltiplo de 2, 3, 4 y 6 columnas, filas completas
  en todos los anchos. `QA_CATALOG_PAGE_SIZE` (1–100) solo existe para probar varias
  páginas con el seed en una instancia local; nunca se define en Vercel.
- **Desktop**: `← Anterior 1 … 7 8 9 … 42 Siguiente →` (`paginationItems`: primera, última,
  actual ±1, cinco seguidas cerca de los extremos; ≤ 7 páginas → todas).
- **Móvil**: `← Anterior · Página 3 de 42 · Siguiente →`, objetivos de 40 px.
- Enlaces reales (`<a href>`); en la primera/última página Anterior/Siguiente son
  `<button disabled>` (no enlaces falsos). `<nav aria-label="Paginación de productos">`,
  página actual con `aria-current="page"`. Con una sola página no se muestra.
- Al cambiar de página se lleva al **inicio de la lista** (`#lista-productos`, con
  `scroll-margin` para el header sticky), no al inicio de la página.

## Consultas (vista `public.catalog_items`, migración `…20261107000100`)

- Una fila por producto de la sucursal con todo lo que muestra la tarjeta y el **precio
  efectivo** calculado en la base: la promoción vigente más baja **solo si es menor** al
  precio normal; si no, el precio normal (misma semántica que antes).
- `security_invoker = true`: la vista se evalúa con los permisos de quien consulta
  (`anon` en la tienda), así que respeta la RLS existente: solo sucursales, productos,
  subcategorías y categorías activos; promociones vigentes; marca con `LEFT JOIN` (un
  producto sin marca o con marca inactiva aparece sin marca). Agotados siguen apareciendo.
- **Filtro, orden global, conteo y paginación en PostgreSQL** (PostgREST `.order`,
  `.range`, `count: "exact"`): nunca se descarga el catálogo completo. Orden
  predeterminado: categoría, subcategoría, nombre, presentación, `id`; por precio:
  `effective_price` asc/desc, nombre, presentación, `id` (desempate estable: las páginas
  no repiten ni saltan productos).
- Página más allá del final: PostgREST responde `PGRST103`; se hace un conteo `head` y la
  página muestra «Esta página no existe».
- **Inicio**: Ofertas y Destacados piden 12 cada una y "Nuestros productos" 24, con
  "Ver todos los productos (N)" hacia `/productos`. **Carrito**: `getBranchProductsByIds`.
- **Facetas**: `brand_id` y `subcategory_id` de los productos visibles (solo en el
  servidor) para ofrecer subcategorías y marcas con productos.
- **Índices**: no se agregaron. `branch_products (branch_id, product_id)` (único),
  `products (subcategory_id)` y `(brand_id)` ya existen. El `ILIKE` por prefijo de
  palabra (`'% term%'`) no aprovecha un btree y `pg_trgm` no está instalado; con miles de
  productos el recorrido es de milisegundos (prueba de volumen con 1600 productos en
  `tests/integration/catalog-view.test.mjs`). Reevaluar `pg_trgm` si el catálogo crece a
  decenas de miles.

## Interfaz

- **Desktop**: chips de categoría y subcategoría (enlaces), chips de filtros activos y
  selects de Marca y "Ordenar por" que aplican al cambiar.
- **Móvil**: chips de categoría/subcategoría deslizables y botón **Filtros** que abre
  un panel inferior (`<dialog>` nativo: foco atrapado, Esc cierra, el foco vuelve al
  botón). Los cambios se aplican con "Ver resultados".
- Client Components: `SearchField` (header), `CatalogResults`, `CatalogPagination`, `DesktopFilterControls`,
  `MobileFilterButton` y `PendingHint` (spinner mientras navega un enlace). El resto
  de la página es Server Component.
