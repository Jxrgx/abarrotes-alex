# Autenticación y autorización administrativa (Fase 7)

Panel en `/admin`, con Supabase Auth (email + contraseña) y autorización por rol en
la base de datos. No hay registro público ni cuentas de clientes.

## Arquitectura

```
Navegador ──▶ src/proxy.ts (solo /admin)          refresca sesión (getClaims) y redirige
                 │                                 sin sesión → /admin/login
                 ▼
          Server Components /admin (Suspense)      requireAdmin(): JWT + profiles.role
                 │                                 no admin → /admin/sin-acceso
                 ▼
          Supabase (RLS)                           private.is_admin() en cada política
```

Tres capas, cada una suficiente por sí misma para no exponer datos:

1. **Proxy** (`src/proxy.ts`, convención de Next.js 16; reemplaza a `middleware.ts`).
   Solo corre en `/admin` y `/admin/*`: la tienda pública no paga su costo. Refresca
   la sesión con `@supabase/ssr` (`src/lib/supabase/proxy.ts`), redirige de forma
   optimista y marca las respuestas con `Cache-Control: private, no-store`.
2. **Servidor** (`src/lib/auth/session.ts`): `getAdminContext()` verifica el JWT con
   `supabase.auth.getClaims()` y lee el rol del profile; `requireAdmin()` redirige.
   Se llama en el layout del panel **y en cada página protegida** (layouts y páginas
   se renderizan en paralelo); `cache()` evita consultas repetidas en el mismo request.
3. **Base de datos**: políticas RLS con `private.is_admin()`. Aunque alguien tuviera
   una sesión válida y saltara la UI, sin `role = admin` no lee ni escribe nada.

La autoridad es **`auth.users` + `profiles.role`**. Nunca se usa el email para autorizar.

### Cliente de Supabase

Todo lo relacionado con Auth usa el cliente SSR con cookies
(`src/lib/supabase/server.ts`). La tienda pública usa un cliente sin cookies
(`src/lib/supabase/public.ts`); ver "Clientes de Supabase" en [database.md](database.md).

### Cache Components

`cacheComponents: true` sigue activo. Las partes que leen cookies (`getAdminContext`)
están dentro de `<Suspense>` y empiezan con `await connection()`: con Partial
Prefetching las cookies están disponibles al prerenderizar el App Shell, y
`@supabase/auth-js` compara la expiración de la sesión con `Date.now()`; sin
`connection()` esa comparación ocurriría durante el prerender. el shell estático no contiene datos y la verificación
ocurre antes de renderizar el contenido del panel. El fallback es un esqueleto vacío.

## Roles y profiles

- `profiles.id` = `auth.users.id`; `profiles.role` ∈ `admin`, `employee`, **sin default**.
- Usuario autenticado sin profile o con `employee`: sin privilegios (por ahora
  `employee` no tiene funciones; queda preparado para la Fase 8+).
- **Nadie** puede crear, editar ni borrar profiles desde la API (sin políticas de
  escritura y sin privilegios `INSERT/UPDATE/DELETE`). Cada usuario solo puede leer
  su propio profile. Así nadie puede auto-asignarse `admin`.
- **No hay trigger de creación automática de profiles.** No existe registro público
  y un profile automático no aportaría nada sin un flujo de invitación; además
  evitamos cualquier riesgo de asignar un rol por defecto. Los profiles se crean de
  forma explícita (ver abajo). Si en el futuro hay invitaciones, un trigger podría
  crear el profile con `role = 'employee'`, **nunca** `admin`.

## `private.is_admin()`

```sql
select exists (select 1 from public.profiles
               where id = (select auth.uid()) and role = 'admin');
```

- `SECURITY DEFINER` + `search_path = ''`: lee `profiles` sin pasar por su RLS, sin
  recursión y sin abrir lectura de profiles.
- En el esquema `private` (no expuesto por la API). `EXECUTE` solo para `authenticated`.
- Las políticas la usan como `(select private.is_admin())` para evaluarla una vez por consulta.

## Políticas RLS administrativas (migración `…000500_admin_auth.sql`)

| Tabla | Admin | Notas |
| --- | --- | --- |
| `branches`, `branch_hours`, `categories`, `subcategories`, `brands`, `products` | SELECT (incluye inactivos), INSERT, UPDATE | **Sin DELETE**: desactivación lógica (`is_active` / `is_closed`); además se revocó el privilegio. |
| `branch_products` | SELECT, INSERT, UPDATE, DELETE | Asignar/quitar un producto de la sucursal es configuración; los pedidos guardan snapshot. |
| `promotions` | SELECT, INSERT, UPDATE, DELETE | Borrar una promoción errónea no afecta pedidos (precio guardado en `order_items`). |
| `orders` | SELECT, UPDATE **solo de `status`** | Privilegio por columna. No inserta (eso es `create_order`) ni borra. |
| `order_items` | SELECT | Snapshot inmutable. |
| `order_status_history` | SELECT | Lo escribe el trigger `log_status_change` (con `changed_by = auth.uid()`) y `create_order`. |
| `profiles` | SELECT de su propio profile | Sin escritura vía API. |

Las políticas públicas de lectura del catálogo (activos) no cambian. `create_order`
no se modificó.

Pendiente para la Fase 8: validar transiciones de estado (p. ej. no volver de
`delivered` a `new`), idealmente con una función `update_order_status`.

## Login y logout

- `/admin/login`: correo y contraseña → Server Action `signIn` →
  `supabase.auth.signInWithPassword`. Las cookies de sesión las escribe `@supabase/ssr`.
  La contraseña no se guarda ni se registra en ningún lugar propio.
- Mensaje genérico para credenciales incorrectas y emails inexistentes:
  "No pudimos iniciar sesión con esas credenciales." (no revela si una cuenta existe).
  Error de red: mensaje de conexión. Enter envía el formulario.
- Si las credenciales son válidas pero la cuenta no es admin, se cierra esa sesión
  y se informa que no tiene acceso.
- Sesión existente en `/admin/login` → `/admin` (sin loops: `/admin/sin-acceso` nunca
  redirige al login si hay sesión).
- **Cerrar sesión**: `supabase.auth.signOut()` y navegación completa con `replace` a
  `/admin/login`. Se descarta el estado en memoria y las páginas de `/admin` no se
  cachean, así que "Atrás" vuelve a pedir la página y el proxy redirige al login.
- Sin registro, login social ni recuperación de contraseña (no implementados).

## Crear el primer administrador (manual, una sola vez)

1. **Desactivar el registro público** (recomendado): Supabase Dashboard →
   Authentication → Sign In / Providers → desactivar *Allow new users to sign up*.
   Hoy está activo en el proyecto; aunque una cuenta nueva no tendría privilegios
   (sin profile), no hay motivo para permitir registros.
2. **Crear el usuario**: Authentication → Users → *Add user* → *Create new user*,
   con su correo y una contraseña segura, marcando *Auto Confirm User*.
3. **Asignar el rol** en SQL Editor (reemplaza el correo):

   ```sql
   insert into public.profiles (id, full_name, role)
   select id, 'Nombre del administrador', 'admin'
   from auth.users
   where email = 'correo-del-admin@ejemplo.com';
   ```

   Debe insertar exactamente 1 fila. Para un empleado futuro: `'employee'`.
4. Entrar en `/admin/login`.

Para quitar acceso: `delete from public.profiles where id = '<uuid>';` o cambiar el
rol desde el SQL Editor. Las credenciales nunca se guardan en el repositorio.

## Storage

Implementado en la Fase 8C.2 con la misma autoridad: el bucket `product-images` es de
lectura pública y solo `private.is_admin()` puede subir, reemplazar o borrar objetos
(políticas en `storage.objects`). Ver [storage.md](storage.md).

## Pruebas

- PGlite: 72 casos de RLS (anon, autenticado sin profile, employee, admin).
- Supabase remoto: la misma matriz con usuarios simulados dentro de una transacción
  revertida (no quedan usuarios, profiles ni datos).
- Navegador/HTTP: redirecciones del proxy, login incorrecto, error de red, sesión
  inválida, ausencia de proxy en la tienda. Las pruebas con sesión real requieren un
  admin creado según los pasos anteriores.
