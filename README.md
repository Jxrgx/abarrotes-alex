# Abarrotes Alex

Aplicación web de Abarrotes Alex: tienda pública y panel administrativo, diseñada como multisucursal.

> Estado actual: base del proyecto. Todavía no hay funcionalidades de negocio.

## Stack

- Next.js 16 (App Router) + React 19
- TypeScript (modo `strict`)
- Tailwind CSS 4 + shadcn/ui
- Supabase (PostgreSQL, Auth, Storage) mediante `@supabase/ssr`
- Zod + React Hook Form

## Requisitos

- Node.js 20.9 o superior (desarrollado con Node 24)
- npm 10 o superior
- Un proyecto de Supabase (URL y anon key)

## Instalación

```bash
git clone <url-del-repositorio>
cd abarrotes-alex
npm install
```

## Variables de entorno

Copia el archivo de ejemplo y llena los valores de tu proyecto de Supabase
(Supabase Dashboard → Project Settings → API):

```bash
cp .env.example .env.local
```

| Variable                        | Descripción                                   |
| ------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto de Supabase                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave pública (anon) del proyecto de Supabase |

`NEXT_PUBLIC_SUPABASE_URL` debe ser la URL base (`https://<ref>.supabase.co`),
sin `/rest/v1` ni otro path. Para comprobar la conexión:

```bash
npm run check:supabase
```

`.env.local` está ignorado por git. Nunca agregues la `service_role` key a una
variable `NEXT_PUBLIC_*`: esas variables se exponen al navegador.

## Desarrollo

```bash
npm run dev        # servidor de desarrollo en http://localhost:3000
npm run lint       # ESLint
npm run typecheck  # verificación de tipos con TypeScript
npm run build      # build de producción
npm run start      # sirve el build de producción
```

## Base de datos

El esquema se define con migraciones SQL de Supabase CLI en `supabase/migrations/`
y un seed de desarrollo en `supabase/seed.sql`. Detalle del modelo en
[docs/database.md](docs/database.md).

```bash
npx supabase start     # base local (requiere Docker)
npx supabase db reset  # aplica migraciones desde cero + seed (solo local)
npx supabase db push --remote  # aplica migraciones pendientes al proyecto vinculado
```

## Estructura general

```
src/
├── app/                 # Rutas (App Router). Server Components por defecto.
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css      # Tailwind + tema de shadcn/ui
├── components/
│   └── ui/              # Componentes de shadcn/ui (se agregan conforme se necesiten)
├── lib/
│   ├── supabase/
│   │   ├── client.ts    # Cliente para Client Components (navegador)
│   │   ├── server.ts    # Cliente para Server Components / Server Functions / Route Handlers
│   │   └── env.ts       # Lectura y validación de variables de Supabase
│   └── utils.ts         # Utilidad `cn` para clases de Tailwind
└── types/               # Tipos compartidos (p. ej. tipos generados de la base de datos)
```

Para agregar un componente de shadcn/ui:

```bash
npx shadcn@latest add <componente>
```
