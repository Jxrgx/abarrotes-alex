# Notificaciones de pedidos: PWA + Web Push + Realtime (Fase 10)

Objetivo: cuando un cliente confirma un pedido, el dueño se entera **sin que el cliente
mande WhatsApp**. La base sigue siendo la fuente de verdad; las notificaciones son un aviso
(Web Push no garantiza la entrega) y WhatsApp queda como contacto opcional.

```
Cliente confirma ─► POST /api/pedidos ─► public.create_order (transacción)
                                          ├─ INSERT orders
                                          └─ trigger private.on_order_created
                                               ├─ private.order_push_events (1 fila por pedido)
                                               └─ realtime.send → Broadcast privado "admin:orders"
                       respuesta al cliente ◄─┘
                       after(): dispatchNewOrderPush(orderId)
                          ├─ claim_order_push (secreto) → reclamo único + dispositivos
                          ├─ web-push (VAPID) → servicio push del navegador → Android / desktop
                          └─ finish_order_push → borra 404/410, registra éxitos/fallos
Panel abierto ◄── Broadcast "admin:orders" (solo admins, RLS) → aviso + sonido + router.refresh()
```

## PWA del panel

- `public/admin.webmanifest`, enlazado **solo** desde `src/app/admin/layout.tsx`
  (`metadata.manifest`). A un cliente nunca se le ofrece instalar una app que abre el
  login del panel: la tienda tiene su propia PWA (abajo).
- `start_url: /admin`, `scope: /admin`, `display: standalone`, `id: /admin`. Al abrir el
  icono: con sesión → dashboard; sin sesión → login (lo decide `proxy.ts`).
- Iconos derivados del logo real con `scripts/brand-assets.mjs`: `icon-192.png`,
  `icon-512.png` (círculo transparente) e `icon-maskable-512.png` (logo al 78 % sobre
  blanco, dentro de la zona segura de Android).
- Criterios de instalación de Chrome: HTTPS, manifest con nombre, iconos 192/512,
  `start_url` y `display` standalone. No hace falta banner propio: Chrome ofrece
  "Instalar aplicación" en el menú ⋮. La tarjeta del dashboard muestra una ayuda discreta
  si la app no corre instalada.

## PWA de la tienda (clientes)

- `public/tienda.webmanifest`, enlazado solo desde `src/app/(tienda)/layout.tsx` con un
  `<link rel="manifest">` (React lo coloca en `<head>`). No con `metadata.manifest`: en
  páginas con `generateMetadata` dinámico (`/productos`) Next.js transmite los metadatos
  al final de `<body>` y Chrome solo lee el manifest en `<head>`.
  `id`/`start_url`/`scope`: `/`, `display: standalone`, mismos iconos de marca.
- Son **dos apps distintas** (ids `/` y `/admin`): instalar la tienda abre `/`; instalar
  el panel abre `/admin`. Las páginas del panel no enlazan el manifest de la tienda
  (el `metadata.manifest` del layout de `/admin` lo reemplaza), así que desde `/admin`
  solo se ofrece instalar el panel, y desde la tienda solo la tienda.
- Los scopes están anidados (`/admin` ⊂ `/`): Chrome Android elige la app instalada con
  el scope más específico, así que las rutas `/admin/...` (p. ej. el clic en una
  notificación) deben seguir abriendo la app del panel aunque ambas estén instaladas.
  Verificarlo en el dispositivo del dueño al instalar las dos.
- No usa el Service Worker: la tienda no lo registra, no pide permisos de notificación y
  no tiene modo offline. El SW (scope `/`) solo atiende `push`/`notificationclick` del
  panel y no tiene handler de `fetch`, así que no altera la navegación de la tienda.

### Instalación en Android (dueño)

1. Abrir `https://<dominio>/admin` en **Chrome** e iniciar sesión.
2. Menú ⋮ → **Instalar aplicación** (o "Agregar a pantalla principal").
3. Abrir "Abarrotes Alex" desde el icono → dashboard.
4. En "Notificaciones de pedidos" → **Activar notificaciones de pedidos** → **Permitir**.

## Service Worker (`public/sw.js`)

Responsabilidad única: `push` y `notificationclick`. **No hay handler de `fetch`**: no se
cachea nada (panel, pedidos, Auth, APIs) y no hay modo offline. Se sirve con
`Cache-Control: no-cache, no-store, must-revalidate` (`next.config.ts`), `skipWaiting` +
`clients.claim` para que una versión nueva tome control de inmediato.

- **push**: si hay una ventana del panel **visible y enfocada**, no se muestra notificación
  del sistema (la app ya avisa); siempre se envía `postMessage({ type: "order-push" })` a
  las ventanas del panel. Si no, `showNotification(título, { body, icon, tag, data.path })`.
- **notificationclick**: solo rutas `/admin/pedidos/<uuid>` (validadas con regex; cualquier
  otra cosa → `/admin/pedidos`). Si hay una ventana del panel: `focus()` + `navigate()`
  (o `postMessage({ type: "navigate" })` si no está controlada o `navigate()` no existe; un `focus()` rechazado por el sistema no impide navegar). Si no: `openWindow()`.
- El registro lo hace el panel en silencio (`OrderAlerts`), sin pedir permisos.

## Activación por dispositivo (permiso)

- El permiso del navegador **nunca** se pide al cargar: solo al pulsar
  "Activar notificaciones de pedidos" (`components/admin/notifications-card.tsx`).
- Estados: revisando, no compatible, sin configurar (falta la clave VAPID pública),
  desactivadas, activando…, activadas ✓, bloqueadas por el navegador.
- Detección por capacidades (`serviceWorker`, `PushManager`, `Notification`, contexto
  seguro), no por user-agent: funciona en Chrome Android y en desktop.
- **Cada admin decide en cada dispositivo.** Si Jorge nunca activa, no recibe nada; si
  Alexander activa en su Android, ese dispositivo recibe.
- Desactivar: `deletePushSubscription` (RLS: solo la propia) + `subscription.unsubscribe()`.
  No afecta otros dispositivos.
- Al abrir el dashboard con una suscripción existente se vuelve a guardar (idempotente):
  recupera suscripciones borradas por 404/410 y transfiere el navegador al admin actual si
  cambió la cuenta.
- Sonido: casilla "Sonido con el panel abierto" (preferencia local del dispositivo).

## Suscripciones (`public.push_subscriptions`)

| Columna | Notas |
| --- | --- |
| `user_id` | `profiles.id` (cascade). Varias filas por admin (multidispositivo) |
| `endpoint` | único, `https://`, ≤2048. Dato técnico sensible: nunca en logs |
| `p256dh`, `auth` | claves de cifrado del navegador |
| `last_success_at`, `last_failure_at` | resultado del último envío |

- RLS: `select`/`delete` solo de las propias y solo admins. Sin `insert`/`update` directos:
  el alta pasa por `save_push_subscription` (SECURITY DEFINER, exige admin, upsert por
  endpoint). `anon` no tiene acceso.
- Se envía a los dispositivos de usuarios con `role = 'admin'` (un empleado no recibe).

## Disparo, idempotencia y bypass

**Elegido: `POST /api/pedidos` + bandeja en la base.**

- `create_order` no cambia. Un trigger `AFTER INSERT` en `orders` crea **una** fila en
  `private.order_push_events` por pedido (PK = `order_id`) y emite el Broadcast. Si la
  transacción se revierte (`PRICE_CHANGED`, error), no queda ni evento ni mensaje.
- Tras responder al cliente, `after()` llama `dispatchNewOrderPush(orderId)` (Vercel
  `waitUntil`). `claim_order_push` hace `UPDATE … SET claimed_at = now() WHERE claimed_at IS
  NULL`: solo una invocación lo logra. Reintentos del navegador (`replayed`), dobles clics o
  invocaciones simultáneas **no duplican** el push (garantía en la base, no en memoria).
- Se llama también con `replayed = true`: si la invocación original se cortó antes de
  reclamar, el reintento envía el aviso (como máximo una vez). Si se cortó después de
  reclamar y antes de enviar, ese aviso se pierde (at-most-once, preferible a duplicar).
- No se envía para pedidos de más de 1 hora (protección ante reintentos tardíos).
- **Trade-off aceptado (Fase 9A, `create_order` público):** un pedido creado llamando la RPC
  directamente (sin `/api/pedidos`) **no genera push**, pero **sí** dispara el Broadcast y
  aparece en el panel. Alternativa evaluada: trigger → `pg_net` → endpoint. Cubre el bypass,
  pero requiere `pg_net`, guardar URL y secreto en la base, no tiene reintentos y es más
  complejo. Se puede adoptar después sin cambiar el modelo (la bandeja ya existe).

### Despacho con secreto acotado (sin `service_role`)

El servidor necesita leer las suscripciones de los admins. En lugar de la llave
`service_role`/`sb_secret` (acceso total), se usan dos funciones con un secreto propio:

- `claim_order_push(order_id, secret)` → `{ order_id, folio, total, delivery_type, subscriptions }`.
- `finish_order_push(order_id, secret, ok[], failed[], gone[])` → borra 404/410 y registra.
- La base guarda **solo el hash SHA-256** del secreto (`private.app_secrets`), configurado
  una vez con `select private.set_push_dispatch_secret('<secreto>');`. Sin el secreto
  correcto: `FORBIDDEN`. Si se filtrara, el alcance es leer endpoints de admins y marcar
  envíos; no da acceso a pedidos, clientes ni catálogo.

## Payload (sin PII)

`{ title: "Nuevo pedido ALEX-000123", body: "$245.50 · Entrega a domicilio", url:
"/admin/pedidos/<uuid>", tag: "pedido-<uuid>", orderId, folio }`. Nunca nombre, teléfono,
dirección, referencias ni notas. El detalle se consulta en el panel con sesión de admin.
`TTL` 1 hora, `urgency: high`. El enlace usa el UUID interno del pedido (privado; la ruta
exige sesión de admin).

## Realtime (panel abierto)

- **Broadcast privado** (recomendación actual de Supabase sobre Postgres Changes): el
  trigger usa `realtime.send({ order_id, folio }, 'order_created', 'admin:orders', true)`.
- Autorización: política `admins_receive_order_events` en `realtime.messages` (SELECT solo
  si `realtime.topic() = 'admin:orders'`, extensión `broadcast` y `private.is_admin()`).
  Sin política de INSERT: ningún cliente puede publicar en ese topic.
- Cliente (`components/admin/order-alerts.tsx`): `supabase.realtime.setAuth()` (token de la
  sesión) + `channel('admin:orders', { config: { private: true } })`. Al recibir: aviso
  "Nuevo pedido ALEX-…" con "Ver pedido", `router.refresh()` (dashboard, lista y pendientes
  se vuelven a consultar con la sesión) y sonido.
- Sin polling ni conexiones del lado del servidor: el WebSocket vive en el navegador.
- **App suspendida**: iOS/Android cierran el WebSocket cuando la app pasa a segundo plano y
  los Broadcast perdidos no se reenvían. Por eso el panel hace `router.refresh()` al volver a
  primer plano (`visibilitychange` → visible, o `pageshow` desde bfcache) y cuando el canal se
  vuelve a suscribir tras una reconexión. Son eventos, no polling: en segundo plano no se
  consulta nada.
- **Deduplicación**: por `order_id` (Realtime + mensaje del SW + reconexiones) → un aviso y un
  sonido por pedido. Solo la pestaña visible suena.
- Sonido: dos tonos cortos (Web Audio, volumen bajo), solo después de una interacción con
  la página (política de autoplay); si el navegador no lo permite, el aviso es solo visual.

## Fallos

- Un error del push **nunca** cambia la respuesta del pedido (`after()` corre después y
  `dispatchNewOrderPush` nunca lanza). Logs sin PII ni endpoints: `[push] …`.
- 404/410 del servicio push → la suscripción se borra. Otros códigos → `last_failure_at`.
- Sin configuración (VAPID o secreto ausentes) → el push se omite en silencio; Realtime y
  el panel siguen funcionando.
- El trigger nunca revierte el pedido: `order_push_events` y `realtime.send` están en
  bloques `EXCEPTION` que solo emiten un `WARNING`.

## Variables

| Variable | Tipo | Dónde |
| --- | --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | PUBLIC (va al navegador) | Vercel Production + local (opcional) |
| `VAPID_PRIVATE_KEY` | **SERVER secreto** | Vercel Production (Sensitive). Nunca `NEXT_PUBLIC_` |
| `VAPID_SUBJECT` | SERVER (no secreto) | `mailto:` del negocio o URL del sitio |
| `PUSH_DISPATCH_SECRET` | **SERVER secreto** | Vercel Production (Sensitive); su hash en la base |

Generar VAPID: `npx web-push generate-vapid-keys` (una vez; la privada no se imprime en
reportes ni se versiona). Rotarlas invalida las suscripciones: cada dispositivo debe
volver a activar (la tarjeta lo resuelve sola al reemplazar la suscripción).

## CSP

Solo se agregó `wss://<host exacto de Supabase>` a `connect-src` (WebSocket de Realtime).
`worker-src 'self' blob:` y `manifest-src 'self'` ya existían. El servidor contacta los
servicios push (FCM, Mozilla…); el navegador no necesita `connect-src` hacia ellos.

## Checkout y WhatsApp

- Confirmación: **"¡Pedido recibido!"** — "Tu pedido ALEX-… fue enviado a Abarrotes Alex. En
  breve será procesado. Conserva tu folio." (no promete que el dueño vio la notificación).
- WhatsApp: botón secundario **"Contactar por WhatsApp"**; mensaje "Hola, tengo una
  consulta sobre mi pedido ALEX-…" con el resumen. Nunca se abre solo.
- Checkout: "Tu pedido se envía directamente a Abarrotes Alex." Carrito y hero ya no dicen
  que el pedido se envía por WhatsApp.

## Pruebas

- `npm test`: payload sin PII, despacho (no configurado, ya reclamado, 404/410, errores
  sin lanzar ni filtrar endpoints), dedupe, Service Worker en un contexto simulado
  (sin fetch, panel visible/oculto, URL manipulada, clic abierto/cerrado), manifest e iconos.
- `npm run test:db`: RLS de suscripciones (propias, otros admins, empleado, anon, sin
  escritura directa), multidispositivo, un evento por pedido, `replayed` sin evento nuevo,
  `PRICE_CHANGED` sin evento ni Broadcast, Realtime Authorization, secreto, reclamo único,
  payload sin PII, limpieza 404/410.
- `npm run test:e2e:notifications`: manifest solo en el panel, SW registrado sin pedir
  permiso, tarjeta, y un push **sintético** entregado por Chrome (CDP) al SW: aviso en la
  app con el panel visible (sin notificación duplicada) y notificación del sistema fuera.
- No se envían pushes reales ni se crean pedidos en pruebas.

## Troubleshooting

- "Todavía no están configuradas": falta `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en el build.
- "Bloqueadas por el navegador": Ajustes del sitio (candado) → Notificaciones → Permitir.
- No llega el push con la app cerrada: revisar que el dispositivo aparezca activado, que
  Android no tenga a Chrome en ahorro de batería extremo y que las notificaciones de
  Chrome/la app estén permitidas en Ajustes de Android.
- El panel no se actualiza solo: revisar la migración `20261106000200` aplicada y la
  consola (canal `admin:orders`).
- Logs de Vercel: buscar `[push]` (sin datos personales).
