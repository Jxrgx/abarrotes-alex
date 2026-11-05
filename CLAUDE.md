@AGENTS.md

# Abarrotes Alex

- Modelo de datos y Supabase: [docs/database.md](docs/database.md)
- Búsqueda y filtros del catálogo: [docs/catalog.md](docs/catalog.md)
- Carrito (formato, hidratación y frontera de seguridad): [docs/cart.md](docs/cart.md)
- Creación segura de pedidos (`create_order`, errores, idempotencia): [docs/orders.md](docs/orders.md)
- Checkout, confirmación y WhatsApp: [docs/checkout.md](docs/checkout.md)
- Autenticación y autorización del panel (`/admin`, roles, RLS): [docs/auth.md](docs/auth.md)
- Panel administrativo (navegación, dashboard, métricas, zona horaria): [docs/admin.md](docs/admin.md)
- Imágenes de producto (Storage, bucket, paths, procesamiento con sharp): [docs/storage.md](docs/storage.md)
- Promociones (semántica de vigencia, solapamiento, estados, zona horaria): [docs/promotions.md](docs/promotions.md)
- Pruebas: `npm test` (unitarias), `npm run test:db` (PGlite: migraciones, RLS, estados de
  pedidos, promociones) y `npm run test:e2e*` (navegador con sesión real). Ver
  [tests/README.md](tests/README.md). Solo datos sintéticos en pruebas versionadas.
- Supabase: datos públicos con `getPublicSupabase()` (sin cookies, anon); Auth y datos
  de sesión con `createClient()` de `lib/supabase/server.ts`. Ver docs/database.md.

## UI/UX Design System

- Toda interfaz debe seguir [docs/design-system.md](docs/design-system.md).
  **Consúltalo antes de crear o modificar cualquier UI.**
- Identidad: premium, moderna y amigable ("supermercado local moderno y bien
  diseñado"), nunca SaaS, fintech ni plantilla genérica.
- Paleta principal: azul (marca y acciones), blanco y grafito, en proporción
  60/30/10. Solo light mode.
- Usa los tokens semánticos de `src/app/globals.css`; nunca hex en componentes.
- Mobile-first es obligatorio: diseña a 360px primero, con targets táctiles ≥ 40px.
- shadcn/ui es la base técnica, no la identidad visual: personaliza tokens,
  radios y variantes de cada componente; no aceptes su aspecto por defecto.
