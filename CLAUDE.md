@AGENTS.md

# Abarrotes Alex

- Modelo de datos y Supabase: [docs/database.md](docs/database.md)
- Búsqueda y filtros del catálogo: [docs/catalog.md](docs/catalog.md)

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
