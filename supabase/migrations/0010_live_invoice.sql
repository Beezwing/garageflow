-- ============================================================================
-- GarageFlow — 0010 Live invoice + technician completion
--
-- The invoice now exists from check-in and stays in sync with the work order.
-- Parts / labour / services added anywhere on the job flow straight onto it.
-- Technicians get an append-only work log and a "mark my work done" action.
-- ============================================================================

-- ---- technician work log ------------------------------------------------
create table if not exists public.work_order_notes (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author_id     uuid references auth.users(id),
  kind          text not null default 'work',   -- work | diagnosis | note
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_notes_wo on public.work_order_notes(work_order_id, created_at);
alter table public.work_order_notes enable row level security;

drop policy if exists wo_notes_read on public.work_order_notes;
create policy wo_notes_read on public.work_order_notes for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin()
         or public.portal_owns_work_order(work_order_id));
drop policy if exists wo_notes_write on public.work_order_notes;
create policy wo_notes_write on public.work_order_notes for insert to authenticated
  with check (public.is_garage_member(garage_id) and author_id = auth.uid());

-- ---- assignment completion --------------------------------------------
alter table public.technician_assignments add column if not exists completed_at timestamptz;

-- ---- invoice <-> work order sync -------------------------------------
create or replace function public.sync_wo_invoice(p_wo uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_wo public.work_orders%rowtype;
  v_inv uuid;
  v_seq bigint;
  v_number text;
  v_rate numeric(6,4);
begin
  select * into v_wo from public.work_orders where id = p_wo;
  if v_wo.id is null then return null; end if;

  -- the one open invoice for this job (draft / unpaid / partial)
  select id into v_inv from public.invoices
    where work_order_id = p_wo and status in ('draft','unpaid','partial')
    order by created_at limit 1;

  if v_inv is null then
    if v_wo.status = 'cancelled' then return null; end if;
    select coalesce(tax_rate,0) into v_rate from public.garages where id = v_wo.garage_id;
    v_seq := public.next_counter(v_wo.garage_id, 'invoice:' || to_char(now(),'YYYY'));
    v_number := 'INV-' || to_char(now(),'YYYY') || '-' || lpad(v_seq::text, 6, '0');
    insert into public.invoices (garage_id, number, work_order_id, customer_id, status, tax_rate)
    values (v_wo.garage_id, v_number, p_wo, v_wo.customer_id, 'draft', v_rate)
    returning id into v_inv;
  end if;

  -- rebuild the auto lines (leave any manually-added 'other'/'discount' lines alone)
  delete from public.invoice_items
    where invoice_id = v_inv
      and source_type in ('work_order_parts','work_order_labor','work_order_services');

  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
    select garage_id, v_inv, 'part', description, quantity, unit_price, amount, 'work_order_parts', id
      from public.work_order_parts where work_order_id = p_wo;
  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
    select garage_id, v_inv, 'labor', description, hours, rate, amount, 'work_order_labor', id
      from public.work_order_labor where work_order_id = p_wo;
  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
    select garage_id, v_inv, 'service', description, quantity, unit_price, amount, 'work_order_services', id
      from public.work_order_services where work_order_id = p_wo;

  perform public.recalc_invoice(v_inv);
  return v_inv;
end $$;
grant execute on function public.sync_wo_invoice(uuid) to authenticated;

create or replace function public._trg_sync_wo_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_wo_invoice(coalesce(new.work_order_id, old.work_order_id));
  return null;
end $$;

drop trigger if exists trg_sync_inv_parts on public.work_order_parts;
create trigger trg_sync_inv_parts after insert or update or delete on public.work_order_parts
  for each row execute function public._trg_sync_wo_invoice();
drop trigger if exists trg_sync_inv_labor on public.work_order_labor;
create trigger trg_sync_inv_labor after insert or update or delete on public.work_order_labor
  for each row execute function public._trg_sync_wo_invoice();
drop trigger if exists trg_sync_inv_services on public.work_order_services;
create trigger trg_sync_inv_services after insert or update or delete on public.work_order_services
  for each row execute function public._trg_sync_wo_invoice();

-- generate_invoice is now just a manual re-sync
create or replace function public.generate_invoice(p_work_order uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.has_garage_role(
       (select garage_id from public.work_orders where id = p_work_order),
       array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized';
  end if;
  return public.sync_wo_invoice(p_work_order);
end $$;

-- ---- check-in now opens the invoice ----------------------------------
create or replace function public.check_in_vehicle(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_garage uuid := (payload->>'garage_id')::uuid;
  v_customer uuid := nullif(payload->>'customer_id','')::uuid;
  v_vehicle uuid := nullif(payload->>'vehicle_id','')::uuid;
  v_number text;
  v_seq bigint;
  v_wo uuid;
  v_line jsonb;
begin
  if not public.has_garage_role(v_garage, array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized to check in vehicles';
  end if;

  if v_customer is null then
    insert into public.customers (garage_id, name, phone, email, address, notes, created_by)
    values (v_garage, payload->'customer'->>'name', payload->'customer'->>'phone',
            nullif(payload->'customer'->>'email',''), payload->'customer'->>'address',
            payload->'customer'->>'notes', auth.uid())
    returning id into v_customer;
  end if;

  if v_vehicle is null then
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, vin,
                                 engine_number, color, transmission, fuel_type, mileage, notes)
    values (v_garage, v_customer,
            payload->'vehicle'->>'make', payload->'vehicle'->>'model',
            nullif(payload->'vehicle'->>'year','')::int,
            payload->'vehicle'->>'license_plate', payload->'vehicle'->>'vin',
            payload->'vehicle'->>'engine_number', payload->'vehicle'->>'color',
            payload->'vehicle'->>'transmission', payload->'vehicle'->>'fuel_type',
            nullif(payload->'vehicle'->>'mileage','')::int, payload->'vehicle'->>'notes')
    returning id into v_vehicle;
  end if;

  v_seq := public.next_counter(v_garage, 'work_order:' || to_char(now(), 'YYYY'));
  v_number := 'JOB-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 6, '0');

  insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, priority,
                                  complaint, requested_work, notes, mileage_in, fuel_level_in,
                                  expected_completion, checked_in_by)
  values (v_garage, v_number, v_customer, v_vehicle, 'awaiting_inspection',
          coalesce((payload->>'priority')::work_order_priority, 'normal'),
          payload->>'complaint', payload->>'requested_work', payload->>'notes',
          nullif(payload->>'mileage_in','')::int, nullif(payload->>'fuel_level_in','')::int,
          nullif(payload->>'expected_completion','')::date, auth.uid())
  returning id into v_wo;

  if nullif(payload->>'mileage_in','') is not null then
    update public.vehicles set mileage = (payload->>'mileage_in')::int where id = v_vehicle;
  end if;

  -- planned work entered at check-in → service lines (an estimate that becomes the bill)
  if jsonb_typeof(payload->'planned') = 'array' then
    for v_line in select * from jsonb_array_elements(payload->'planned') loop
      insert into public.work_order_services (garage_id, work_order_id, service_id, description, quantity, unit_price, created_by)
      values (v_garage, v_wo, nullif(v_line->>'service_id','')::uuid,
              coalesce(v_line->>'description','Planned work'),
              coalesce(nullif(v_line->>'quantity','')::numeric, 1),
              coalesce(nullif(v_line->>'unit_price','')::numeric, 0), auth.uid());
    end loop;
  end if;

  perform public.sync_wo_invoice(v_wo);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_garage, auth.uid(), 'work_order.checked_in', 'work_order', v_wo::text,
          jsonb_build_object('number', v_number));

  return jsonb_build_object('work_order_id', v_wo, 'number', v_number,
                            'customer_id', v_customer, 'vehicle_id', v_vehicle);
end $$;

-- ---- technician marks their work done --------------------------------
create or replace function public.tech_mark_work_done(p_wo uuid, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_garage uuid;
  v_open int;
  v_status work_order_status;
begin
  select garage_id, status into v_garage, v_status from public.work_orders where id = p_wo;
  if v_garage is null or not public.is_garage_member(v_garage) then
    raise exception 'not authorized';
  end if;

  update public.technician_assignments
    set completed_at = now()
    where work_order_id = p_wo and technician_id = auth.uid() and completed_at is null;

  if coalesce(trim(p_note),'') <> '' then
    insert into public.work_order_notes (garage_id, work_order_id, author_id, kind, body)
    values (v_garage, p_wo, auth.uid(), 'work', p_note);
  end if;

  -- close this technician's running clock
  update public.time_entries set ended_at = now()
    where work_order_id = p_wo and technician_id = auth.uid() and ended_at is null;

  -- all assigned technicians done (or a manager marking it) → repair completed
  select count(*) into v_open from public.technician_assignments
    where work_order_id = p_wo and completed_at is null;

  if (v_open = 0 or public.has_garage_role(v_garage, array['garage_admin','supervisor']::membership_role[]))
     and v_status in ('in_progress','assigned','awaiting_parts','awaiting_customer_approval') then
    update public.time_entries set ended_at = now() where work_order_id = p_wo and ended_at is null;
    update public.work_orders set status = 'repair_completed', completed_at = now() where id = p_wo;

    -- issue the invoice so it lands on the cashier's list
    update public.invoices set status = 'unpaid', issued_at = coalesce(issued_at, now())
      where work_order_id = p_wo and status = 'draft';
    perform public.recalc_invoice(id) from public.invoices where work_order_id = p_wo and status <> 'cancelled';

    insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id)
    values (v_garage, array['garage_admin','supervisor','receptionist']::membership_role[],
            (select number from public.work_orders where id = p_wo) || ' ready to invoice',
            'Repairs complete — take payment.', 'work_order', p_wo::text);
    return 'repair_completed';
  end if;

  return v_status::text;
end $$;
grant execute on function public.tech_mark_work_done(uuid, text) to authenticated;

-- ---- close open clocks on checkout ----------------------------------
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
                                id_verified, released_by, customer_signature, override_id, final_mileage, notes)
  values (v_wo.garage_id, v_wo.id, coalesce(payload->'checklist','[]'::jsonb),
          payload->>'collected_by_name', payload->>'relationship',
          coalesce((payload->>'id_verified')::boolean, false), auth.uid(),
          payload->>'customer_signature', v_override,
          nullif(payload->>'final_mileage','')::int, payload->>'notes')
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

-- backfill: give every open job that has no invoice one now
do $$
declare r record;
begin
  for r in select id from public.work_orders where status not in ('checked_out','cancelled') loop
    perform public.sync_wo_invoice(r.id);
  end loop;
end $$;
