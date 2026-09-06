-- ============================================================================
-- GarageFlow — 0002 Customers, Vehicles, Work Orders, Inspections, Photos
-- ============================================================================

do $$ begin
  create type work_order_status as enum (
    'checked_in','awaiting_inspection','inspected','assignment_pending','assigned',
    'in_progress','awaiting_parts','awaiting_customer_approval','repair_completed',
    'quality_check','ready_for_payment','paid','ready_for_pickup','checked_out','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_order_priority as enum ('normal','urgent','emergency');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum ('scheduled','confirmed','arrived','completed','cancelled','no_show');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Per-garage sequential counters (job numbers, invoice numbers, ...)
-- ----------------------------------------------------------------------------
create table if not exists public.garage_counters (
  garage_id uuid not null references public.garages(id) on delete cascade,
  key       text not null,
  value     bigint not null default 0,
  primary key (garage_id, key)
);
alter table public.garage_counters enable row level security;
create policy counters_read on public.garage_counters
  for select to authenticated using (public.is_garage_member(garage_id));

create or replace function public.next_counter(p_garage uuid, p_key text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.garage_counters (garage_id, key, value)
  values (p_garage, p_key, 1)
  on conflict (garage_id, key) do update set value = public.garage_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- Customers
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  garage_id   uuid not null references public.garages(id) on delete cascade,
  name        text not null,
  phone       text,
  email       citext,
  address     text,
  notes       text,
  portal_user_id uuid references auth.users(id),   -- optional linked portal login
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_customers_garage on public.customers(garage_id) where deleted_at is null;
create index if not exists idx_customers_phone on public.customers(garage_id, phone);
create index if not exists idx_customers_name on public.customers(garage_id, lower(name));
create index if not exists idx_customers_portal on public.customers(portal_user_id);
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Vehicles
-- ----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  garage_id      uuid not null references public.garages(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete cascade,
  make           text,
  model          text,
  year           int,
  license_plate  text,
  vin            text,
  engine_number  text,
  color          text,
  transmission   text,
  fuel_type      text,
  mileage        int,
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_vehicles_garage on public.vehicles(garage_id) where deleted_at is null;
create index if not exists idx_vehicles_customer on public.vehicles(customer_id);
create unique index if not exists uq_vehicles_plate on public.vehicles(garage_id, upper(license_plate))
  where deleted_at is null and license_plate is not null and license_plate <> '';
create unique index if not exists uq_vehicles_vin on public.vehicles(garage_id, upper(vin))
  where deleted_at is null and vin is not null and vin <> '';
create index if not exists idx_vehicles_engine on public.vehicles(garage_id, upper(engine_number));
create trigger trg_vehicles_updated before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Work Orders
-- ----------------------------------------------------------------------------
create table if not exists public.work_orders (
  id                 uuid primary key default gen_random_uuid(),
  garage_id          uuid not null references public.garages(id) on delete cascade,
  number             text not null,
  customer_id        uuid not null references public.customers(id),
  vehicle_id         uuid not null references public.vehicles(id),
  status             work_order_status not null default 'checked_in',
  priority           work_order_priority not null default 'normal',
  complaint          text,
  requested_work     text,
  notes              text,
  mileage_in         int,
  fuel_level_in      int,          -- 0..100
  mileage_out        int,
  fuel_level_out     int,
  expected_completion date,
  checked_in_by      uuid references auth.users(id),
  checked_in_at      timestamptz not null default now(),
  completed_at       timestamptz,
  checked_out_at     timestamptz,
  cancelled_reason   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (garage_id, number)
);
create index if not exists idx_wo_garage_status on public.work_orders(garage_id, status);
create index if not exists idx_wo_vehicle on public.work_orders(vehicle_id);
create index if not exists idx_wo_customer on public.work_orders(customer_id);
create trigger trg_work_orders_updated before update on public.work_orders
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Inspections (checkin condition) + checklist + damage markers
-- ----------------------------------------------------------------------------
create table if not exists public.inspections (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  kind          text not null default 'checkin',   -- checkin | quality
  checklist     jsonb not null default '[]'::jsonb, -- [{section,item,status,notes}]
  notes         text,
  performed_by  uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_inspections_wo on public.inspections(work_order_id);
create trigger trg_inspections_updated before update on public.inspections
  for each row execute function public.set_updated_at();

create table if not exists public.inspection_damages (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  view          text not null default 'top',       -- front|rear|left|right|top
  x             numeric(6,3) not null,             -- 0..1 relative
  y             numeric(6,3) not null,
  damage_type   text not null,                     -- dent|scratch|crack|broken|missing|paint|rust|mechanical|other
  description   text,
  photo_url     text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_damages_inspection on public.inspection_damages(inspection_id);

-- ----------------------------------------------------------------------------
-- Vehicle photos
-- ----------------------------------------------------------------------------
create table if not exists public.vehicle_photos (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  vehicle_id    uuid references public.vehicles(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  category      text,                              -- front|rear|driver|passenger|interior|odometer|engine|damage|after
  phase         text not null default 'before',    -- before | after
  url           text not null,
  caption       text,
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_photos_wo on public.vehicle_photos(work_order_id);
create index if not exists idx_photos_vehicle on public.vehicle_photos(vehicle_id);

-- ----------------------------------------------------------------------------
-- Customer acknowledgement of recorded condition
-- ----------------------------------------------------------------------------
create table if not exists public.acknowledgements (
  id                  uuid primary key default gen_random_uuid(),
  garage_id           uuid not null references public.garages(id) on delete cascade,
  work_order_id       uuid not null references public.work_orders(id) on delete cascade,
  statement           text not null,
  customer_signature  text,   -- data URL / storage path
  staff_signature     text,
  staff_user_id       uuid references auth.users(id),
  signed_at           timestamptz not null default now()
);
create index if not exists idx_ack_wo on public.acknowledgements(work_order_id);

-- ----------------------------------------------------------------------------
-- Appointments
-- ----------------------------------------------------------------------------
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  customer_id   uuid references public.customers(id) on delete set null,
  vehicle_id    uuid references public.vehicles(id) on delete set null,
  service_id    uuid,
  title         text,
  scheduled_at  timestamptz not null,
  duration_min  int not null default 60,
  staff_id      uuid references auth.users(id),
  notes         text,
  status        appointment_status not null default 'scheduled',
  work_order_id uuid references public.work_orders(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_appts_garage_date on public.appointments(garage_id, scheduled_at);
create trigger trg_appts_updated before update on public.appointments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Generic tenant RLS policy helper (applied per table below)
-- Pattern: SELECT for any member; write for member roles listed.
-- ============================================================================
alter table public.customers          enable row level security;
alter table public.vehicles           enable row level security;
alter table public.work_orders        enable row level security;
alter table public.inspections        enable row level security;
alter table public.inspection_damages enable row level security;
alter table public.vehicle_photos     enable row level security;
alter table public.acknowledgements   enable row level security;
alter table public.appointments       enable row level security;

-- Customers: all members read; admin/supervisor/receptionist write
create policy customers_read on public.customers for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy customers_write on public.customers for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

-- Vehicles: same as customers
create policy vehicles_read on public.vehicles for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy vehicles_write on public.vehicles for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

-- Work orders: all members read; admin/supervisor/receptionist create/update;
-- technicians can update (status/notes) too — enforced granularly in app layer
create policy wo_read on public.work_orders for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy wo_write on public.work_orders for all to authenticated
  using (public.is_garage_member(garage_id))
  with check (public.is_garage_member(garage_id));

-- Inspections / damages / photos / acknowledgements: member read, member write
create policy insp_read on public.inspections for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy insp_write on public.inspections for all to authenticated
  using (public.is_garage_member(garage_id)) with check (public.is_garage_member(garage_id));

create policy dmg_read on public.inspection_damages for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy dmg_write on public.inspection_damages for all to authenticated
  using (public.is_garage_member(garage_id)) with check (public.is_garage_member(garage_id));

create policy photos_read on public.vehicle_photos for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy photos_write on public.vehicle_photos for all to authenticated
  using (public.is_garage_member(garage_id)) with check (public.is_garage_member(garage_id));

create policy ack_read on public.acknowledgements for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy ack_write on public.acknowledgements for all to authenticated
  using (public.is_garage_member(garage_id)) with check (public.is_garage_member(garage_id));

create policy appts_read on public.appointments for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy appts_write on public.appointments for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

-- ============================================================================
-- Check-in RPC: create-or-reuse customer + vehicle, open a work order
-- ============================================================================
create or replace function public.check_in_vehicle(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_garage uuid := (payload->>'garage_id')::uuid;
  v_customer uuid := nullif(payload->>'customer_id','')::uuid;
  v_vehicle uuid := nullif(payload->>'vehicle_id','')::uuid;
  v_number text;
  v_seq bigint;
  v_wo uuid;
begin
  if not public.has_garage_role(v_garage, array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized to check in vehicles';
  end if;

  -- Customer
  if v_customer is null then
    insert into public.customers (garage_id, name, phone, email, address, notes, created_by)
    values (v_garage, payload->'customer'->>'name', payload->'customer'->>'phone',
            nullif(payload->'customer'->>'email',''), payload->'customer'->>'address',
            payload->'customer'->>'notes', auth.uid())
    returning id into v_customer;
  end if;

  -- Vehicle
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

  -- Job number  JOB-YYYY-000123
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

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_garage, auth.uid(), 'work_order.checked_in', 'work_order', v_wo::text,
          jsonb_build_object('number', v_number));

  return jsonb_build_object('work_order_id', v_wo, 'number', v_number,
                            'customer_id', v_customer, 'vehicle_id', v_vehicle);
end $$;

grant execute on function public.check_in_vehicle(jsonb) to authenticated;
grant execute on function public.next_counter(uuid, text) to authenticated;
