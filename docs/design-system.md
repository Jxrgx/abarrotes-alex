# Sistema de diseño — Abarrotes Alex

Guía obligatoria para toda interfaz (tienda pública y panel). Los tokens viven en
[`src/app/globals.css`](../src/app/globals.css); este documento explica cómo usarlos.

## 1. Identidad

**"Supermercado local moderno y bien diseñado."** Moderno, premium, amigable,
confiable, cercano y sencillo. Una tienda de abarrotes mexicana con presencia
digital profesional, sin perder lo local y accesible.

**No debe parecer:** dashboard SaaS, fintech o banca, marketplace genérico,
plantilla prediseñada, tienda de lujo distante ni interfaz corporativa.

## 2. Principios UX (en orden de prioridad)

1. Claridad
2. Facilidad de compra
3. Velocidad visual
4. Jerarquía
5. Accesibilidad
6. Mobile-first
7. Consistencia

- Comprensible para usuarios con poca experiencia comprando en línea.
- La acción principal de cada pantalla es evidente.
- Los iconos acompañan al texto; no sustituyen etiquetas importantes.

## 3. Color

**Solo light mode.** No hay dark mode. La clase `.dark` nunca se aplica; las
utilidades `dark:` de shadcn quedan inertes a propósito.

### Regla 60 / 30 / 10

- **60 %:** blanco y superficies neutras (`background`, `surface`, `card`, `background-secondary`).
- **30 %:** grafito y grises (texto, bordes, separadores).
- **10 %:** azul de marca, solo en acciones y elementos importantes. Nunca fondos
  grandes en azul ni secciones enteras azules.

### Tokens

Usa siempre la utilidad semántica (`bg-primary`, `text-muted-foreground`,
`border-border`…). **Nunca escribas hex en componentes.**

| Token (utilidad)              | Valor     | Uso                                                       |
| ----------------------------- | --------- | --------------------------------------------------------- |
| `background`                  | `#FFFFFF` | Fondo de página                                           |
| `background-secondary`        | `#F7F8FA` | Fondos secundarios, separación de secciones               |
| `surface` / `card` / `popover` | `#FFFFFF` | Tarjetas, paneles, menús                                 |
| `foreground`                  | `#101828` | Texto principal                                           |
| `muted-foreground`            | `#475467` | Texto secundario (descripciones, presentación)            |
| `subtle-foreground`           | `#667085` | Texto tenue (metadatos, placeholders, ayudas)             |
| `primary`                     | `#155EEF` | Marca y acción principal                                  |
| `primary-foreground`          | `#FFFFFF` | Texto sobre `primary`                                     |
| `primary-hover`               | `#004EEB` | Hover de acciones `primary`                               |
| `primary-dark`                | `#00359E` | Pressed, texto azul sobre fondos azules suaves            |
| `primary-soft`                | `#EFF4FF` | Selección (categoría o filtro activo), badges de marca    |
| `primary-subtle`              | `#F5F8FF` | Realces muy ligeros de sección                            |
| `secondary` / `muted` / `accent` | `#F2F4F7` | Relleno neutro, skeletons, hover de ghost y menús     |
| `border`                      | `#E4E7EC` | Bordes de cards y separadores                             |
| `border-subtle`               | `#EAECF0` | Divisores internos                                        |
| `input`                       | `#D0D5DD` | Borde de campos de formulario                             |
| `ring`                        | `#155EEF` | Foco visible                                              |
| `success` / `-strong` / `-soft` | `#17B26A` / `#067647` / `#ECFDF3` | Éxito                           |
| `warning` / `-strong` / `-soft` | `#F79009` / `#B54708` / `#FFFAEB` | Advertencia                     |
| `destructive` / `-strong` / `-soft` | `#D92D20` / `#B42318` / `#FEF3F2` | Error y acción destructiva  |
| `destructive-foreground`      | `#FFFFFF` | Texto sobre `destructive`                                 |
| `chart-1…5`, `sidebar-*`      | escala azul y gris | Panel administrativo futuro                      |

**Ajustes respecto a la paleta original (por contraste):**

- `success` (2.76:1) y `warning` (2.35:1) **no sirven como texto**. Se usan para
  iconos, puntos y rellenos. Para texto se agregaron `success-strong`,
  `warning-strong` y `destructive-strong`, todos con ≥ 5.2:1 sobre blanco y sobre su `-soft`.
- Nunca texto blanco sobre `success` ni sobre `warning`. Los badges de estado
  usan `bg-*-soft text-*-strong`.
- Se añadió `#F2F4F7` como gris de relleno y hover: queda entre `background-secondary`
  y `border`, y hace visibles los skeletons tanto sobre blanco como sobre `background-secondary`.
- Se añadió `input` `#D0D5DD`, un paso más oscuro que `border`, para distinguir campos de cards.

## 4. Tipografía

**Geist** (ya configurada con `next/font`). No agregar otra fuente sin una razón clara.

| Nivel     | Clases                                                   | Tamaño       |
| --------- | -------------------------------------------------------- | ------------ |
| Display   | `text-4xl md:text-5xl font-semibold tracking-tight`      | 36 → 48px    |
| H1        | `text-3xl md:text-4xl font-semibold tracking-tight`      | 30 → 36px    |
| H2        | `text-2xl md:text-3xl font-semibold tracking-tight`      | 24 → 30px    |
| H3        | `text-lg md:text-xl font-semibold`                       | 18 → 20px    |
| Body      | `text-base` (lectura), `text-sm` (UI densa, cards)       | 16 / 14px    |
| Small     | `text-sm`; `text-xs` **solo** en badges y metadatos      | 14 / 12px    |

- Peso por defecto `font-medium` / `font-semibold`. `font-bold` solo en precios
  destacados o display, nunca en párrafos.
- Nunca menos de 12px. Precios y nombres de producto ≥ 14px.
- Usa `tabular-nums` en precios y cantidades.

## 5. Espaciado y layout

- Escala en múltiplos de 4: `1 (4) · 2 (8) · 3 (12) · 4 (16) · 5 (20) · 6 (24) · 8 (32) · 10 (40) · 12 (48) · 16 (64)`.
- Entre secciones: `py-8 md:py-12` (32–48px). No usar los espacios enormes de landing SaaS.
  El catálogo debe verse rápido.
- **Contenedor:** clase `page-container`, con máximo de 1280px y padding de 16px (móvil),
  24px (`md`) y 32px (`lg`).
- Grid de productos: `grid-cols-2` en móvil, `sm:grid-cols-3`, `lg:grid-cols-4`, `xl:grid-cols-5`,
  con `gap-3 md:gap-4`. Las cards no se estiran más de lo que permite el grid.

## 6. Radios

| Elemento                 | Clase          | Valor  |
| ------------------------ | -------------- | ------ |
| Badges, chips internos   | `rounded-md`   | 8px    |
| Inputs y botones         | `rounded-lg`   | 10px   |
| Cards, promociones, overlays | `rounded-xl` | 14px |
| Pills                    | `rounded-full` | —      |

Pills **solo** para badges, estados, filtros compactos y promociones. No todo es pill.

## 7. Sombras y superficies

Priorizar **borde + contraste de superficie + espaciado** sobre sombras.

- `shadow-card`: casi imperceptible, para cards en reposo (opcional).
- `shadow-card-hover`: hover de cards interactivas.
- `shadow-overlay`: popovers, menús, drawers.

Prohibido: sombras negras grandes, neumorfismo, glows y efectos luminosos.

## 8. Botones

| Variante       | Aspecto                                        | Uso                                    |
| -------------- | ---------------------------------------------- | -------------------------------------- |
| `primary`      | `bg-primary text-primary-foreground hover:bg-primary-hover` | Agregar, continuar, confirmar |
| `secondary`    | `bg-background border border-input text-foreground hover:bg-accent` | Acciones alternativas |
| `ghost`        | Sin fondo; `hover:bg-accent`                   | Acciones terciarias, iconos con etiqueta |
| `destructive`  | `bg-destructive text-destructive-foreground`   | Solo acciones destructivas reales      |

- La variante `secondary` del diseño corresponde a `outline` en shadcn; al
  instalar el botón, ajústalo para que coincida con esta tabla.
- Altura: `h-10` (40px) por defecto y `h-11` (44px) en acciones principales en móvil.
  Los botones solo-icono también miden 40×40 como mínimo.
- Todos los estados son obligatorios: hover, `focus-visible`, active (pressed),
  `disabled` real (atributo, no solo estilo) y loading (spinner y texto, sin cambiar el ancho).
- Una sola acción `primary` por grupo o card.

## 9. Componentes de tienda (reglas para construirlos)

### Product card

Compacta. Jerarquía de arriba abajo:

1. **Imagen** (protagonista).
2. Marca: `text-xs text-subtle-foreground`, opcional porque `brand_id` puede ser NULL.
3. **Nombre**: `text-sm font-medium`, máximo 2 líneas (`line-clamp-2`).
4. Presentación: `text-sm text-muted-foreground`.
5. **Precio**: `text-base md:text-lg font-semibold tabular-nums`.
6. Acción **Agregar**: botón `primary` de ancho completo, con texto y no solo icono.

Debe verse cómoda a 2 por fila en un móvil de 360px. Nada de información extra.

### Imágenes de producto

- Proporción fija `aspect-square`, `object-contain`, fondo blanco o `background-secondary`
  y padding alrededor del producto. No recortar empaques.
- Sin imagen: placeholder consistente (fondo `background-secondary` + icono lucide
  en `subtle-foreground`). Nunca iconos rotos ni huecos vacíos.
- `alt` descriptivo: nombre + presentación.
- `products.image_path` es un path de Storage; la URL se construye en código.

### Promociones

- Badge **"Oferta"** (pill, `bg-primary-soft text-primary-dark` o `bg-destructive-soft text-destructive-strong`).
- Precio promocional destacado y precio anterior tachado (`line-through text-subtle-foreground`)
  marcado también con texto accesible ("Antes $X").
- Sin banners rojos gigantes ni animaciones parpadeantes.

### Agotado

- El producto **sigue visible**.
- Énfasis reducido (imagen con `opacity-60`), badge **"Agotado"** con texto (no solo color)
  y botón realmente `disabled` con el texto "Agotado".

### Header

- Se reconoce de inmediato: **Abarrotes Alex · sucursal · búsqueda · carrito**.
- Desktop: una fila horizontal clara. Móvil: compacto, con la búsqueda visible
  (segunda fila si hace falta) y el carrito a un toque.
- Sticky si mejora la experiencia, con fondo `background` y `border-b`, sin sombra fuerte.

### Búsqueda

- Acción primaria del catálogo, con buena presencia visual. Placeholder: **"Buscar productos..."**.
- `<label>` accesible (puede ser `sr-only`), icono de lupa y altura ≥ 40px.
- En móvil, visible sin abrir menús.

### Categorías

- Fáciles de recorrer y sin cards gigantes: chips o tiles compactos con icono o imagen y nombre.
- Seleccionada: `bg-primary-soft text-primary-dark` + `aria-current`; en móvil, scroll horizontal
  sin provocar overflow de la página.

## 10. Feedback y movimiento

- Toda acción interactiva tiene feedback: hover, focus, pressed, loading, success y disabled.
  El usuario siempre sabe si algo ocurrió (p. ej. al agregar al carrito: cambio de estado en
  el botón + contador actualizado).
- Duraciones: `duration-150` (hover, color) y `duration-200` (overlays); máximo 250ms.
  Easing `ease-out`.
- Permitido: hover suave, cambios de estado, entrada discreta de overlays y feedback del carrito.
- Prohibido: animaciones decorativas constantes, parallax, elementos flotando,
  entradas exageradas y rebotes.
- `prefers-reduced-motion` desactiva animaciones globalmente (base en `globals.css`).

## 11. Mobile-first

- Diseña primero a 360px y amplía con `sm:` / `md:` / `lg:`.
- Prioridades en móvil: buscar, navegar categorías, ver precio, agregar y llegar al carrito.
- Adapta la jerarquía; no comprimas el layout de desktop.
- Targets táctiles ≥ 40px (44px en acciones principales). Sin overflow horizontal.
- Desktop aprovecha el espacio con más columnas, no con cards más grandes.

## 12. Accesibilidad

- Contraste WCAG AA: texto ≥ 4.5:1 (todos los tokens de texto cumplen sobre
  `background` y `background-secondary`).
- **Foco visible**: outline global de 2px en `ring` con offset de 2px (5.41:1). En
  componentes con `focus-visible:ring-*` usa `ring-ring` a opacidad completa;
  **nunca `ring-ring/50`** (el default de shadcn), porque no alcanza 3:1.
- Campos: siempre con `<label>` visible (o `sr-only` en la búsqueda) porque el
  borde `input` (1.47:1) por sí solo no identifica el campo. Los errores se
  indican con texto, no solo con borde rojo.
- HTML semántico (`header`, `nav`, `main`, `button` vs `a`), `alt` en imágenes y
  `aria-label` en botones solo-icono.
- `disabled` real y navegación completa por teclado.
- Ningún estado se comunica solo con color (agotado, oferta, error → siempre con texto).
- `lang="es-MX"` en `<html>`.

## 13. Iconografía

- Solo **lucide-react**. Tamaños `size-4` (16px) junto a texto `sm` y `size-5` (20px)
  en botones e iconos de header. Stroke por defecto (2).
- Los iconos decorativos llevan `aria-hidden`.

## 14. shadcn/ui

shadcn es la **base técnica**, no la identidad. Al agregar un componente:

1. Revisa que use los tokens de este sistema (no grises neutros ni `ring/50`).
2. Ajusta radios, alturas y variantes a esta guía.
3. Elimina variantes que no usemos para no tener cinco estilos de botón.

La app no debe verse como una demo de shadcn.

## 15. Consistencia y componentes

Antes de crear un patrón: **¿ya existe? → reutilízalo → extiéndelo → solo entonces crea uno nuevo.**
Variantes explícitas (`cva`) y responsabilidades claras. No abstraigas antes de que el
patrón se repita, pero cuando se repita, conviértelo en componente.

## 16. Checklist antes de dar por terminada una pantalla

- [ ] ¿Parece un producto comercial terminado?
- [ ] ¿La acción principal es evidente?
- [ ] ¿Hay suficiente contraste y foco visible?
- [ ] ¿Lo importante (producto, precio, acción) aparece primero?
- [ ] ¿Funciona bien a 360px, sin overflow horizontal?
- [ ] ¿Sobra algún elemento?
- [ ] ¿La densidad es apropiada para una tienda?
- [ ] ¿Respeta azul / blanco / grafito y la regla 60/30/10?
- [ ] ¿Parece Abarrotes Alex y no una plantilla genérica?

Si alguna respuesta es "no", se ajusta antes de cerrar.
