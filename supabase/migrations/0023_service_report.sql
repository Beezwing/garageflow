-- ============================================================================
-- GarageFlow — 0023 end-of-service report
-- ============================================================================
-- A dedicated, customer-facing field for whatever the technician/supervisor
-- wants the customer to know going forward (e.g. "front pads at ~20%,
-- replace within 3 months") — kept separate from the general checkout
-- `notes` field, which is an internal release note, not customer-facing copy.

alter table public.checkouts add column if not exists customer_notes text;

create or replace function public.check_out_vehicle(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_wo public.work_orders%rowtype;
  v_balance numeric(12,2);
  v_override uuid := nullif(payload->>'override_id','')::uuid;
  v_id uuid;
begin
  select * into v_wo from public.work_orders where id = (payload->>'work_order_id')::uuid;
  if v_wo.id is null or not public.has_garage_role(v_wo.garage_id,
       array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(balance),0) into v_balance from public.invoices
    where work_order_id = v_wo.id and status not in ('cancelled','draft');

  if v_balance > 0 and v_override is null then
    raise exception 'cannot check out: outstanding balance of %. An authorised override is required.', v_balance;
  end if;

  insert into public.checkouts (garage_id, work_order_id, checklist, collected_by_name, relationship,
                                id_verified, released_by, customer_signature, override_id, final_mileage,
                                notes, customer_notes)
  values (v_wo.garage_id, v_wo.id, coalesce(payload->'checklist','[]'::jsonb),
          payload->>'collected_by_name', payload->>'relationship',
          coalesce((payload->>'id_verified')::boolean, false), auth.uid(),
          payload->>'customer_signature', v_override,
          nullif(payload->>'final_mileage','')::int, payload->>'notes', payload->>'customer_notes')
  returning id into v_id;

  update public.time_entries set ended_at = now() where work_order_id = v_wo.id and ended_at is null;

  update public.work_orders
    set status = 'checked_out', checked_out_at = now(),
        mileage_out = coalesce(nullif(payload->>'final_mileage','')::int, mileage_out)
    where id = v_wo.id;

  if nullif(payload->>'final_mileage','') is not null then
    update public.vehicles set mileage = (payload->>'final_mileage')::int where id = v_wo.vehicle_id;
  end if;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, reason, after)
  values (v_wo.garage_id, auth.uid(), 'work_order.checked_out', 'work_order', v_wo.id::text,
          case when v_override is not null then 'checkout override' else null end,
          jsonb_build_object('collected_by', payload->>'collected_by_name', 'balance', v_balance));

  return v_id;
end $$;

grant execute on function public.check_out_vehicle(jsonb) to authenticated;
