-- =============================================================================
-- Abarrotes Alex · Dashboard administrativo (Fase 8A)
--
-- public.admin_dashboard(): métricas del panel en una sola llamada, calculadas
-- en PostgreSQL (sin descargar pedidos para sumar).
-- - SECURITY INVOKER: corre con la RLS del usuario; solo un admin ve pedidos.
--   Además rechaza explícitamente a quien no es admin (FORBIDDEN).
-- - La zona horaria del negocio y los estados "pendientes" llegan como
--   parámetros desde una única definición en la aplicación (src/lib/business.ts,
--   src/lib/orders/status.ts).
-- Ver docs/admin.md.
-- =============================================================================

create function public.admin_dashboard(
  p_branch_id uuid,
  p_time_zone text,
  p_pending_statuses public.order_status[],
  p_recent_limit integer default 8,
  p_top_limit integer default 5,
  p_top_days integer default 30
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_local_today date;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not coalesce((select private.is_admin()), false) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- "Hoy" en la zona del negocio (no UTC): [00:00, 24:00) hora local.
  v_local_today := (now() at time zone p_time_zone)::date;
  v_start := v_local_today::timestamp at time zone p_time_zone;
  v_end := (v_local_today + 1)::timestamp at time zone p_time_zone;

  return jsonb_build_object(
    'today_start', v_start,
    -- Pedidos de hoy: el conteo incluye cancelados; importes y ticket los excluyen.
    'today', (
      select jsonb_build_object(
        'orders', count(*),
        'cancelled', count(*) filter (where o.status = 'cancelled'),
        'amount', coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)::numeric(12, 2)::text,
        'average_ticket', coalesce(round(avg(o.total) filter (where o.status <> 'cancelled'), 2), 0)::numeric(12, 2)::text
      )
      from public.orders o
      where o.branch_id = p_branch_id and o.created_at >= v_start and o.created_at < v_end
    ),
    -- Pendientes: cualquier fecha; requieren operación.
    'pending', (
      select count(*) from public.orders o
      where o.branch_id = p_branch_id and o.status = any (p_pending_statuses)
    ),
    'recent', coalesce((
      select jsonb_agg(r order by r.created_at desc)
      from (
        select o.id, o.folio, o.customer_name, o.delivery_type, o.total::text as total, o.shipping_cost is null as shipping_pending, o.status, o.created_at
        from public.orders o
        where o.branch_id = p_branch_id
        order by o.created_at desc
        limit p_recent_limit
      ) as r
    ), '[]'::jsonb),
    -- Productos más pedidos (últimos p_top_days días, sin pedidos cancelados).
    -- Se agrupa por product_id (identidad estable aunque el producto cambie de
    -- nombre) y se muestra el snapshot más reciente de order_items.
    'top_products', coalesce((
      select jsonb_agg(t order by t.position)
      from (
        select
          row_number() over (order by sum(i.quantity) desc, count(distinct i.order_id) desc, i.product_id) as position,
          i.product_id,
          (array_agg(i.product_name order by i.created_at desc))[1] as name,
          (array_agg(i.product_presentation order by i.created_at desc))[1] as presentation,
          trim_scale(sum(i.quantity)) as quantity,
          count(distinct i.order_id) as orders
        from public.order_items i
        join public.orders o on o.id = i.order_id
        where o.branch_id = p_branch_id
          and o.status <> 'cancelled'
          and o.created_at >= now() - make_interval(days => p_top_days)
        group by i.product_id
        order by position
        limit p_top_limit
      ) as t
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.admin_dashboard is
  'Métricas del panel administrativo (solo admin; SECURITY INVOKER + RLS). Ver docs/admin.md.';

revoke all on function public.admin_dashboard(uuid, text, public.order_status[], integer, integer, integer)
  from public, anon;
grant execute on function public.admin_dashboard(uuid, text, public.order_status[], integer, integer, integer)
  to authenticated;
