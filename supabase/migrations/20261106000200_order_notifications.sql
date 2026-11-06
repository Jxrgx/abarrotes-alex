-- =============================================================================
-- Notificaciones de pedidos nuevos: Web Push + Realtime (Broadcast privado).
-- Ver docs/notifications.md.
--
-- 1. public.push_subscriptions: dispositivos donde un ADMIN activó explícitamente las
--    notificaciones (una fila por PushSubscription; varias por usuario). Solo el
--    propio admin ve/borra las suyas (RLS); el alta pasa por save_push_subscription.
-- 2. private.order_push_events: bandeja ("outbox") con UNA fila por pedido, creada por
--    un trigger AFTER INSERT en orders. Es la garantía de idempotencia: el envío de
--    push se "reclama" de forma atómica (claimed_at) y solo una vez por pedido, aunque
--    el navegador reintente o haya dos invocaciones simultáneas.
-- 3. El mismo trigger emite un Broadcast PRIVADO mínimo (order_id + folio) en el topic
--    admin:orders; solo admins autenticados pueden recibirlo (RLS en realtime.messages).
--    El panel abierto revalida sus datos con la sesión del admin.
-- 4. claim_order_push / finish_order_push: las usa el servidor (Route Handler) para
--    enviar el push. Protegidas por un secreto ACOTADO (solo su hash SHA-256 vive en la
--    base); no se usa service_role ni se abre lectura de suscripciones.
--
-- Trigger y Broadcast corren dentro de la transacción de create_order: si el pedido se
-- revierte (p. ej. PRICE_CHANGED) no queda evento ni mensaje. Un fallo de la
-- notificación NUNCA revierte el pedido (bloques con EXCEPTION).
-- Pedidos existentes: no se modifican ni generan eventos (el trigger es solo para
-- inserciones nuevas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Suscripciones push por dispositivo
-- -----------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Endpoint del servicio push del navegador (FCM, Mozilla, Apple…). Dato técnico
  -- sensible: nunca se registra completo en logs.
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger set_updated_at before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

comment on table public.push_subscriptions is
  'Dispositivos con notificaciones de pedidos activadas por un admin. RLS: cada admin solo ve/borra las suyas.';

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_admin()));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_admin()));

-- Alta/actualización del dispositivo actual. Si el mismo navegador ya estaba
-- registrado por otro usuario (cambio de cuenta), pasa al usuario actual.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_failure_at = null;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Bandeja de eventos "pedido nuevo" (idempotencia del push)
-- -----------------------------------------------------------------------------

create table private.order_push_events (
  order_id uuid primary key references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Momento en que una invocación del servidor tomó el envío (solo una lo logra).
  claimed_at timestamptz,
  finished_at timestamptz,
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0)
);

comment on table private.order_push_events is
  'Un evento por pedido nuevo (trigger). claimed_at garantiza como máximo un push por pedido.';

revoke all on private.order_push_events from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Trigger: evento + Broadcast privado mínimo
-- -----------------------------------------------------------------------------

create function private.on_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into private.order_push_events (order_id) values (new.id);
  exception when others then
    raise warning 'order_push_events: no se registró el evento (%).', sqlstate;
  end;
  begin
    -- Sin datos personales: el panel consulta el detalle con la sesión del admin.
    perform realtime.send(
      jsonb_build_object('order_id', new.id, 'folio', new.folio),
      'order_created',
      'admin:orders',
      true
    );
  exception when others then
    raise warning 'realtime: no se emitió order_created (%).', sqlstate;
  end;
  return null;
end;
$$;

revoke all on function private.on_order_created() from public, anon, authenticated;

create trigger on_order_created after insert on public.orders
  for each row execute function private.on_order_created();

-- Realtime Authorization: solo admins autenticados reciben el topic admin:orders.
-- Nadie puede enviar a ese topic desde el cliente (sin política de INSERT).
create policy admins_receive_order_events on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'admin:orders'
    and realtime.messages.extension = 'broadcast'
    and (select private.is_admin())
  );

-- -----------------------------------------------------------------------------
-- 4. Despacho de push desde el servidor (secreto acotado)
-- -----------------------------------------------------------------------------

-- Solo se guarda el hash SHA-256 del secreto (nunca el valor). Lo configura el dueño
-- del proyecto una vez: select private.set_push_dispatch_secret('<secreto>');
create table private.app_secrets (
  name text primary key,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

revoke all on private.app_secrets from public, anon, authenticated;

create function private.set_push_dispatch_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(p_secret, '')) < 32 then
    raise exception 'El secreto debe tener al menos 32 caracteres.';
  end if;
  insert into private.app_secrets (name, sha256)
  values ('push_dispatch', encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
  on conflict (name) do update set sha256 = excluded.sha256, updated_at = now();
end;
$$;

revoke all on function private.set_push_dispatch_secret(text) from public, anon, authenticated;

create function private.valid_push_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.app_secrets
    where name = 'push_dispatch'
      and sha256 = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex')
  );
$$;

revoke all on function private.valid_push_secret(text) from public, anon, authenticated;

-- Reclama el envío de un pedido (como máximo una vez) y devuelve lo mínimo para el
-- push (folio, total, tipo de entrega) más los dispositivos de admins. Sin PII del
-- cliente. null = ya reclamado, inexistente o demasiado antiguo (no se envía).
create function public.claim_order_push(p_order_id uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.valid_push_secret(p_secret) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update private.order_push_events e
  set claimed_at = now()
  from public.orders o
  where e.order_id = p_order_id
    and o.id = e.order_id
    and e.claimed_at is null
    and o.created_at > now() - interval '1 hour';
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'order_id', o.id,
    'folio', o.folio,
    'total', o.total::text,
    'delivery_type', o.delivery_type,
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s
      join public.profiles p on p.id = s.user_id
      where p.role = 'admin'
    ), '[]'::jsonb)
  )
  into v_result
  from public.orders o
  where o.id = p_order_id;

  return v_result;
end;
$$;

-- Resultado del envío: borra los endpoints que el servicio push dio por muertos
-- (404/410) y registra éxitos/fallos. Nunca recibe ni guarda datos del cliente.
create function public.finish_order_push(
  p_order_id uuid,
  p_secret text,
  p_ok_endpoints text[],
  p_failed_endpoints text[],
  p_gone_endpoints text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.valid_push_secret(p_secret) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.push_subscriptions where endpoint = any (coalesce(p_gone_endpoints, '{}'));
  update public.push_subscriptions set last_success_at = now()
  where endpoint = any (coalesce(p_ok_endpoints, '{}'));
  update public.push_subscriptions set last_failure_at = now()
  where endpoint = any (coalesce(p_failed_endpoints, '{}'));

  update private.order_push_events
  set finished_at = now(),
      sent_count = cardinality(coalesce(p_ok_endpoints, '{}')),
      failed_count = cardinality(coalesce(p_failed_endpoints, '{}')) + cardinality(coalesce(p_gone_endpoints, '{}'))
  where order_id = p_order_id;
end;
$$;

-- El servidor usa el cliente público (anon); la protección real es el secreto.
revoke all on function public.claim_order_push(uuid, text) from public;
revoke all on function public.finish_order_push(uuid, text, text[], text[], text[]) from public;
grant execute on function public.claim_order_push(uuid, text) to anon, authenticated;
grant execute on function public.finish_order_push(uuid, text, text[], text[], text[]) to anon, authenticated;
