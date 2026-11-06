# Seguridad (Fase 9A)

Auditoría previa a producción de una **tienda local**: protege datos de clientes, la
integridad de pedidos y precios, y el panel. No pretende seguridad bancaria.

## 0. Riesgos residuales aceptados del MVP (decisión del dueño, Fase 9B)

Para el MVP se decidió **no** implementar todavía:

| Medida | Estado | Riesgo aceptado | Mitigación existente |
| --- | --- | --- | --- |
| Cerrar `create_order` a anon (opción B, §3) | Se mantiene la RPC pública | Pedidos falsos enviados directamente a la RPC, sin pasar por `/api/pedidos` | La función valida todo (precios, cantidades, textos, sucursal, idempotencia); no se pueden alterar precios ni quemar folios sin crear un pedido válido |
| Rate limiting (§4) | No implementado | Spam de pedidos (que el personal tendría que cancelar) | Límites de tamaño y validación en `/api/pedidos`; cancelación desde el panel |
| CAPTCHA (§5, login y checkout) | No implementado | Spam en checkout; fuerza bruta/DoS sobre el login del admin | Límites propios de Supabase Auth; mensaje de login genérico; registro público desactivado |

Se revisarán si aparece abuso o antes de crecer (más sucursales o publicidad). Las opciones
y sus trade-offs siguen documentados abajo.

## 1. Modelo de amenazas

### Superficies públicas

| Superficie | Qué expone | Protección |
| --- | --- | --- |
| Tienda (`/`, `/productos`, `/carrito`, `/checkout`) | Catálogo público | Cliente público (anon) + RLS de solo lectura |
| `GET /api/busqueda` | Índice ligero del catálogo | Solo datos públicos; caché pública 60 s |
| `POST /api/carrito` | Precios/disponibilidad actuales | Solo lectura; JSON ≤ 16 KB; ≤ 100 UUID |
| `POST /api/pedidos` | Crea pedidos | JSON ≤ 32 KB, Zod, y `create_order` como autoridad |
| RPC `create_order` (llave pública) | Crea pedidos | Validación completa en la base, idempotencia (ver §3) |
| `/pedido/[folio]` | Comprobante | **No consulta la base**: sale del `sessionStorage` de la pestaña; cualquier folio da la misma respuesta (sin enumeración) |
| `/admin/login` + Supabase Auth | Login | Mensaje genérico, rate limit de Supabase, registro desactivado |
| Storage `product-images` | Fotos | Lectura pública por URL; escritura solo admin; solo WebP ≤ 2 MB |
| Llave pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Visible en el navegador | Segura solo porque **toda** tabla tiene RLS |

### Superficies privadas

`/admin/*` (proxy + `requireAdmin()` + RLS), Server Actions administrativas, funciones
`admin_*` / `update_order_status`, tablas `orders`, `order_items`, `order_status_history`,
`profiles`.

### Amenazas realistas (y respuesta)

| Amenaza | Impacto | Estado |
| --- | --- | --- |
| Spam de pedidos falsos (bots) | Ruido operativo, folios consumidos | **Parcial**: validación fuerte; falta rate limiting (§4, requiere decisión) |
| Manipular precios/promociones desde el navegador | Pérdida económica | **Cubierto**: precios y promociones se recalculan en `create_order` |
| Leer pedidos de otros clientes | Fuga de PII | **Cubierto**: RLS; el comprobante no consulta la base |
| Fuerza bruta al login admin | Toma del panel | **Mitigado** por Supabase Auth; CAPTCHA recomendado (§6) |
| Empleado o usuario sin rol usando la API | Cambios no autorizados | **Cubierto**: `private.is_admin()` en RLS y funciones |
| Subir archivos arbitrarios / usar Storage como hosting | Malware, phishing | **Cubierto**: solo admin, solo `image/webp`, ≤ 2 MB, solo `products/` |
| Imagen "bomba" (pequeña que se expande) | Caída por memoria | **Cubierto** (§13) |
| XSS por nombres, notas o referencias | Robo de sesión admin | **Cubierto**: React escapa todo; sin `dangerouslySetInnerHTML`; CSP |
| Clickjacking del panel | Acciones engañadas | **Cubierto**: `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Secretos en git o en el bundle | Toma de la base | **Cubierto**: no hay secretos server-side; escaneo limpio (§15) |

## 2. Autenticación y autorización

- Supabase Auth (email + contraseña). **Registro público desactivado**
  (`disable_signup: true`, verificado en `/auth/v1/settings`), sin usuarios anónimos ni OAuth.
- Tres capas: `proxy.ts` (redirección optimista), `requireAdmin()` en layout, páginas
  (`AdminGuard`) y **cada** Server Action, y RLS/funciones con `private.is_admin()`.
- Roles probados (PGlite + remoto revertido): anon, autenticado sin profile, employee y
  admin. Solo admin lee pedidos o muta el catálogo; nadie borra entidades del catálogo.
- **Redirecciones**: solo a rutas fijas (`/admin`, `/admin/login`, `/admin/sin-acceso`); no
  hay parámetros `next`/`returnTo` → sin open redirect. Login → `window.location.replace("/admin")`;
  logout → `/admin/login`. Sin loops (`/admin/sin-acceso` nunca redirige al login con sesión).
- Login: mismo mensaje para correo inexistente y contraseña incorrecta.

## 3. Pedidos y `create_order`

`public.create_order` (`SECURITY DEFINER`) es la autoridad: recalcula precio y promoción
vigente, verifica sucursal, disponibilidad y producto activo, valida cantidades (enteras
1–99), ≤ 100 partidas sin repetidos, longitudes de textos, teléfono y efectivo, y es
**idempotente** por `client_request_id`. Todo en una transacción. Sin cambios en 9A.

### ¿RPC pública o solo servidor? (decisión del MVP: se mantiene pública)

Hoy anon puede llamar `create_order` **directamente** con la llave pública (sin pasar por
`/api/pedidos`). No evade ninguna regla de negocio (la función valida todo; probado en
`tests/integration/create-order-abuse.test.mjs`), pero **evade cualquier rate limit** que
pongamos en `/api/pedidos`.

| Opción | Cómo | Pros | Contras |
| --- | --- | --- | --- |
| **A. Mantener** (actual) | anon → RPC | Sin secretos | Rate limit/CAPTCHA en `/api/pedidos` se pueden saltar |
| **B. Solo servidor** (recomendada) | `revoke execute … from anon`; `/api/pedidos` llama la RPC con una **secret key** de Supabase (server-only) | Una sola puerta: el rate limit/CAPTCHA no se saltan | Requiere guardar un secreto con privilegios totales en el servidor (si se filtra, acceso total a la base) |
| C. Token propio | La RPC exige un secreto compartido como argumento | Sin `service_role` | Secreto casero que rotar; equivalente a B con más código |

B es el patrón estándar: la secret key vive solo en variables del servidor (sin
`NEXT_PUBLIC_`), se usa en un único módulo `server-only` y solo para `create_order`
(la función sigue validando todo). **Requiere autorización** (ver §16).

## 4. Rate limiting de pedidos (MVP: no se implementa; riesgo aceptado)

Un limitador en memoria no sirve en serverless (cada instancia tiene su contador). Opciones:

1. **Vercel Firewall (WAF) — regla de rate limit** sobre `POST /api/pedidos` por IP. Sin
   código ni servicios nuevos; se configura en el dashboard de Vercel.
2. **Limitador en PostgreSQL** (tabla + función atómica) llamado desde `/api/pedidos`.
   Requiere la opción B (si no, el atacante llama la RPC directa) y por eso una secret key.
3. Upstash Redis (`@upstash/ratelimit`): servicio y cuenta externos.

Recomendación: **B + Vercel WAF** (o B + limitador en PostgreSQL si no se usa Vercel).
Criterios: clave por IP (`x-forwarded-for` de Vercel, que no es falsificable detrás de su
proxy; IPv6 agrupado por /64), límites generosos por NAT (p. ej. 5 pedidos / 10 min y
20 / día por IP), los reintentos idempotentes (mismo `client_request_id`) **no** cuentan, y
respuesta `429` con `Retry-After`. No implementado: requiere configuración externa o secreto.

## 5. CAPTCHA (Cloudflare Turnstile)

No se recomienda en el checkout por ahora: agrega fricción a compradores reales y el
riesgo es bajo para una tienda local. Plan si aparece spam: Turnstile en modo "managed"
(casi siempre invisible). Necesita una cuenta de Cloudflare, una *site key* pública
(`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) y una *secret key* server-only (`TURNSTILE_SECRET_KEY`)
para verificar el token en `/api/pedidos` antes de llamar `create_order`.

## 6. Login administrativo

- El login corre en una Server Action: Supabase Auth ve la IP **del servidor**. Sus límites
  por IP (sign-in) frenan la fuerza bruta, pero un atacante que satura el formulario podría
  hacer que Supabase limite temporalmente también al admin legítimo (DoS, no intrusión).
  Supabase Auth también se puede atacar directamente con la llave pública (limitado por la
  IP del atacante).
- Recomendado para producción: **CAPTCHA nativo de Supabase Auth** (Turnstile/hCaptcha en
  Authentication → Attack Protection; el login enviaría `captchaToken`), contraseña larga y
  única para el admin, y protección contra contraseñas filtradas si el plan la incluye.
  Requiere configuración externa → pendiente de autorización.

## 7. Recuperación de contraseña

No existe en la app. Propuesta mínima segura (pendiente de autorización porque requiere
configurar Supabase):

1. `/admin/recuperar`: formulario con el correo → Server Action
   `resetPasswordForEmail(email, { redirectTo: "<sitio>/admin/restablecer" })`; respuesta
   **siempre** "Si el correo existe, te enviamos un enlace" (no revela cuentas).
2. Plantilla de correo de Supabase con enlace `token_hash` (`/auth/confirm?token_hash=…&type=recovery`)
   → `verifyOtp` en el servidor → `/admin/restablecer` para `updateUser({ password })`.
3. Configurar **Site URL y Redirect URLs** (solo el dominio de producción) y **SMTP propio**
   (el SMTP por defecto de Supabase está limitado y no es para producción).

Mientras tanto: el dueño restablece la contraseña desde el dashboard de Supabase
(Authentication → Users → *Send password recovery* o establecer una nueva).

## 8. Server Actions y CSRF

- Las 12 acciones administrativas empiezan con `requireAdmin()`, validan con Zod (UUIDs,
  enums, números, fechas, longitudes) y registran solo códigos de error. Ninguna acepta
  roles, ni IDs privilegiados sin comprobar: la RLS decide qué filas se tocan.
- **CSRF**: Next.js solo acepta Server Actions por POST, con IDs cifrados, y rechaza las
  que llegan con un `Origin` distinto del `Host`. Además la cookie de sesión de Supabase
  es `SameSite=Lax`. No hacen falta tokens CSRF propios.
- `/api/pedidos` y `/api/carrito` no usan cookies ni sesión (cliente público): un sitio
  ajeno no obtiene más privilegios que llamándolos directamente.

## 9. Endpoints públicos

`readJsonBody()` (`src/lib/http/json-body.ts`) antes de Zod: exige
`Content-Type: application/json` (415), rechaza por `Content-Length` (413) y **corta la
lectura** si el cuerpo real supera el límite (413 o cierre de conexión): un payload enorme
no se parsea ni llega a PostgreSQL. JSON inválido → 400. Otros métodos → 405 (Next.js).
Límites: pedidos 32 KB (100 partidas + textos máximos ≈ 25 KB), carrito 16 KB. Los campos
desconocidos se descartan (Zod). Errores: solo códigos de dominio; nunca SQL, stack ni paths.

## 10. Headers HTTP (`next.config.ts`)

| Header | Valor |
| --- | --- |
| `Content-Security-Policy` | ver §11 |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (no filtra `/admin/pedidos?q=…` ni folios a wa.me) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (solo efectivo en HTTPS) |
| `X-Powered-By` | eliminado (`poweredByHeader: false`) |
| `/admin/*` | además `Cache-Control: private, no-store` y `X-Robots-Tag: noindex, nofollow` (proxy) |

## 11. CSP

CSP **estática** (sin nonce): una CSP con nonce obliga a renderizar cada página
dinámicamente, incompatible con `cacheComponents`/prerender parcial.

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://<proyecto>.supabase.co; font-src 'self' data:;
connect-src 'self' https://<proyecto>.supabase.co; frame-ancestors 'none'; frame-src 'none';
object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self' blob:; manifest-src 'self'
```

- `'unsafe-inline'` en scripts: necesario para los scripts inline de Next.js sin nonce.
  Aun así se bloquean scripts de **otros orígenes**, `<object>`, `<base>` inyectado, envío
  de formularios a terceros y el embebido en iframes. El riesgo de XSS se cubre además con
  el escape de React (sin `dangerouslySetInnerHTML` en el código).
- Desarrollo agrega `'unsafe-eval'` y `ws:`/`wss:` (Turbopack/HMR).
- WhatsApp funciona: es navegación (`<a href="https://wa.me/…">`), que la CSP no restringe.
- Verificado sin violaciones: tienda, carrito, checkout, búsqueda instantánea, login,
  panel, vista previa de imágenes (`blob:`) en producción (`next start`) y en `next dev`.
- Mejora futura: CSP con nonce solo si se abandona el prerender parcial.

## 12. Storage `product-images`

Lectura pública por URL; sin listado para anon; INSERT/UPDATE/DELETE solo admin y solo bajo
`products/`; el bucket acepta únicamente `image/webp` ≤ 2 MB (un HTML o un archivo grande
se rechazan aunque alguien obtuviera una sesión admin). Paths versionados
`products/{id}/{uuid}.webp`, nunca el nombre del usuario. Probado con la llave pública en
`tests/e2e/security.mjs`. Ver [storage.md](storage.md).

## 13. Procesamiento de imágenes

Archivo ≤ 10 MB (navegador y servidor) → `sharp.metadata()` (solo cabecera) → **rechazo
si > 12 000 px por lado o > 40 MP** antes de decodificar → `limitInputPixels` (40 MP) como
segunda barrera → `timeout` de 20 s → WebP ≤ 1200 px. Una "bomba" PNG de < 200 bytes que
declara 30 000 × 30 000 px se rechaza al instante (prueba en `product-image.test.ts`).
Límite de la Server Action: 11 MB (`serverActions.bodySizeLimit`, solo tras `requireAdmin()`).

## 14. Logs y errores

Los `console.error` registran **solo** contexto técnico y códigos (`[admin] products: 23505`):
nunca nombres, teléfonos, direcciones, notas, contraseñas, tokens ni cookies. (En 9A el
log del catálogo dejó de incluir el mensaje de PostgREST.) Al cliente público solo llegan
códigos de dominio y mensajes en español.

## 15. Secretos y variables de entorno

| Variable | Tipo | Dónde |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Navegador y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública (segura solo con RLS) | Navegador y servidor |
| `ADMIN_TEST_EMAIL`, `ADMIN_TEST_PASSWORD` | **Solo pruebas** | `.env.local`; la app nunca las lee |
| (futuro) secret key de Supabase, `TURNSTILE_SECRET_KEY` | **Server-only** | Variables del hosting; nunca `NEXT_PUBLIC_` |

- `.env*` ignorados por git salvo `.env.example` (solo nombres, valores vacíos).
- Escaneo de archivos versionados (9A): sin contraseñas, tokens, JWT, `sb_secret_` ni
  `service_role`. Ningún secreto usa `NEXT_PUBLIC_`.

## 16. Dependencias (`npm audit`, 9A)

- **Runtime: 0 vulnerabilidades** (`npm audit --omit=dev`). Next.js 16.4.4, React 19.3.0,
  `@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.12.7, sharp 0.35.5, zod 4.6.7 (≥ 4.6.6,
  corrige el agotamiento de memoria con colecciones enormes).
- 22 avisos (9 altos) **solo en herramientas de desarrollo**: puppeteer-core (pruebas E2E:
  extract-zip, proxy-agent, una zod antigua anidada), eslint-config-next (minimatch) y el CLI
  `shadcn` (deepmerge). No se ejecutan en el servidor ni llegan al navegador. Sus arreglos
  son cambios mayores (puppeteer 25, o un downgrade de eslint-config-next): se revisarán
  sin `npm audit fix --force`.
- `shadcn` se movió a `devDependencies` (es un CLI; su CSS se resuelve en el build).

## 17. XSS e inyección

- Sin `dangerouslySetInnerHTML`, `innerHTML` ni `eval`. Nombres, notas, referencias y
  direcciones se renderizan como texto (React escapa).
- SQL: no se concatena SQL con input. Las búsquedas usan PostgREST con texto **saneado**
  (catálogo: letras, números, espacio, `-` `.` `'`; pedidos: letras, números, espacio y `-`),
  así que no llegan `,` `(` `)` `*` `%` que alteren el filtro `or`. Las funciones SQL
  reciben parámetros tipados.
- WhatsApp: el número de la sucursal viene de la base (solo dígitos); el mensaje va con
  `encodeURIComponent`. El enlace del panel al cliente usa su teléfono validado (10–15 dígitos).

## 18. Datos personales (PII)

Se guardan: nombre, teléfono, dirección, colonia, referencias, notas y monto en efectivo
(`orders`). Solo el admin los lee (RLS). No se registran en logs ni en pruebas versionadas;
el comprobante del cliente vive en `sessionStorage` (se borra al cerrar la pestaña).

- **Retención (recomendada, no implementada)**: anonimizar nombre, teléfono y dirección de
  pedidos Entregados/Cancelados después de 12 meses, conservando folio, partidas e importes.
- **Búsqueda en la URL del panel** (`/admin/pedidos?q=…`): el texto buscado (posible nombre o
  teléfono) queda en el historial del navegador del admin y en los logs de peticiones del
  hosting. Aceptable para un panel privado; si se quiere evitar, la búsqueda tendría que
  enviarse por POST o estado (perdiendo enlaces compartibles).

## 19. Caché

`/admin/*`: `private, no-store` (proxy) y renderizado dinámico. `/api/pedidos` y
`/api/carrito`: `no-store`. `/api/busqueda`: `public, max-age=60` (solo datos públicos).
La tienda no cachea datos de sesión: usa el cliente público, sin cookies.

## 20. Pruebas de seguridad

| Suite | Cubre |
| --- | --- |
| `npm run test:security` (sin credenciales) | Headers en tienda/panel/API; panel sin sesión (307, no-store, noindex); `/api/pedidos` y `/api/carrito`: método, Content-Type, JSON roto, payload de 40 KB, cuerpo chunked enorme, > 100 partidas, cantidades, textos enormes, UUID inválidos (nunca un pedido válido); RPC admin y lectura de tablas privadas con la llave pública; Storage: subir, HTML, listar y borrar como anon |
| `npm run test:db` → `create-order-abuse.test.mjs` | `create_order` directo como anon con cada abuso; anon no inserta pedidos ni quema folios; idempotencia |
| `npm test` → `product-image.test.ts` | Bomba de descompresión, dimensiones absurdas, archivos falsos |

## 21. Checklist antes de producción

- [x] Registro público de Supabase Auth desactivado (verificado)
- [ ] Admin del cliente creado (profile `admin`, contraseña larga y única)
- [ ] Admin de desarrollo eliminado o degradado
- [ ] Credenciales E2E retiradas (`ADMIN_TEST_*` fuera de cualquier entorno de producción)
- [ ] Datos `__E2E__` eliminados (categoría, subcategoría, marca, producto, pedido ALEX-000003)
- [ ] Catálogo de seed reemplazado por el real (y pedidos de desarrollo limpiados)
- [ ] Decisión RPC pública vs. solo servidor (§3)
- [ ] Rate limiting configurado (§4)
- [ ] CAPTCHA: decidido para login admin (§6) y, si hace falta, checkout (§5)
- [ ] Recuperación de contraseña configurada (§7) o procedimiento manual acordado
- [ ] Dominio propio + HTTPS (HSTS activo)
- [ ] Variables de producción (solo las públicas; secretos server-only si se aprueban)
- [ ] Site URL y Redirect URLs de Supabase Auth con el dominio real
- [ ] Backups/PITR revisados según el plan de Supabase
- [ ] Logs revisados (sin PII) tras una semana de operación
- [ ] `npm audit` revisado (runtime en 0)
- [ ] Pruebas completas: `npm test`, `test:db`, `test:security`, `test:e2e`, `test:e2e:orders`
