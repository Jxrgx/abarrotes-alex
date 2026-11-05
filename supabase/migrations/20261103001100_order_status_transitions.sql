-- =============================================================================
-- Abarrotes Alex · Fase 8E — Máquina de estados de pedidos
-- =============================================================================
-- Transiciones válidas (una sola definición; la UI muestra un espejo de ellas):
--
--   delivery: new → confirmed → preparing → ready → on_the_way       → delivered
--   pickup:   new → confirmed → preparing → ready → ready_for_pickup → delivered
--   cancelled: desde cualquier estado NO final.
--   delivered y cancelled son FINALES (no salen a ningún otro estado).
--
-- Sin saltos (new → delivered falla) y sin cruzar ramas (delivery no pasa por
-- ready_for_pickup ni pickup por on_the_way).
--
-- Autoridad en la base, en dos capas:
--   1. Trigger BEFORE UPDATE OF status: valida TODA actualización de status, venga
--      de la función o de un UPDATE directo por la API (el admin conserva el
--      privilegio por columna de la Fase 7).
--   2. public.update_order_status(): la operación del panel. Exige admin, bloquea la
--      fila y comprueba el estado ESPERADO (concurrencia: si otro admin lo cambió
--      mientras se revisaba, se rechaza en lugar de sobrescribir).
-- El historial lo sigue escribiendo el trigger log_status_change (Fase 7) en la misma
-- transacción, con changed_by = auth.uid(); aquí no se inserta historial.

create function private.order_status_transition_allowed(
  p_delivery_type public.delivery_type,
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from in ('delivered', 'cancelled') then false          -- estados finales
    when p_to = 'cancelled' then true                             -- cancelar antes de entregar
    when p_from = 'new' then p_to = 'confirmed'
    when p_from = 'confirmed' then p_to = 'preparing'
    when p_from = 'preparing' then p_to = 'ready'
    when p_from = 'ready' then p_to = case p_delivery_type
                                        when 'delivery' then 'on_the_way'::public.order_status
                                        else 'ready_for_pickup'::public.order_status
                                      end
    when p_from = 'on_the_way' then p_delivery_type = 'delivery' and p_to = 'delivered'
    when p_from = 'ready_for_pickup' then p_delivery_type = 'pickup' and p_to = 'delivered'
    else false
  end;
$$;

revoke all on function private.order_status_transition_allowed(public.delivery_type, public.order_status, public.order_status) from public, anon;
grant execute on function private.order_status_transition_allowed(public.delivery_type, public.order_status, public.order_status) to authenticated;

create function private.validate_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not private.order_status_transition_allowed(old.delivery_type, old.status, new.status) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'ORD02';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_order_status_transition() from public, anon, authenticated;

create trigger validate_status_transition
  before update of status on public.orders
  for each row execute function private.validate_order_status_transition();

-- Operación del panel. SECURITY INVOKER: usa la RLS y el privilegio por columna del
-- admin (no salta permisos). Devuelve el estado nuevo.
create function public.update_order_status(
  p_order_id uuid,
  p_expected_status public.order_status,
  p_new_status public.order_status
)
returns public.order_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current public.order_status;
  v_delivery public.delivery_type;
begin
  if not (select private.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- FOR UPDATE: dos admins a la vez se serializan; el segundo ve el estado ya cambiado.
  select o.status, o.delivery_type into v_current, v_delivery
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current <> p_expected_status then
    raise exception 'ORDER_STATUS_CHANGED' using errcode = 'ORD01';
  end if;
  if not private.order_status_transition_allowed(v_delivery, v_current, p_new_status) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'ORD02';
  end if;

  update public.orders set status = p_new_status where id = p_order_id;
  return p_new_status;
end;
$$;

revoke all on function public.update_order_status(uuid, public.order_status, public.order_status) from public, anon;
grant execute on function public.update_order_status(uuid, public.order_status, public.order_status) to authenticated;
