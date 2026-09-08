-- GarageFlow — FULL SCHEMA (0001–0010). Then seed.sql + fix_auth_tokens.sql.

-- >>>> FILE: migrations/0001_foundation.sql

-- ============================================================================
-- GarageFlow — 0001 Foundation
-- Extensions, enums, RLS helper functions, tenancy core, settings, audit log
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type garage_status as enum ('trial', 'active', 'suspended', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_role as enum ('garage_admin', 'supervisor', 'technician', 'receptionist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_status as enum ('active', 'invited', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type platform_role as enum ('super_admin');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- updated_at helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Subscription plans (platform-managed, global)
-- ----------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,            -- free | basic | pro | enterprise
  name          text not null,
  price_monthly numeric(12,2) not null default 0,
  price_annual  numeric(12,2) not null default 0,
  limits        jsonb not null default '{}'::jsonb,   -- { users, vehicles, storage_mb }
  features      jsonb not null default '{}'::jsonb,   -- feature flags
  sort_order    int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Garages (tenants)
-- ----------------------------------------------------------------------------
create table if not exists public.garages (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            citext not null unique,
  logo_url        text,
  address         text,
  phone           text,
  email           text,
  tax_number      text,
  business_reg    text,
  currency        text not null default 'JMD',
  tax_label       text not null default 'GCT',
  tax_rate        numeric(6,4) not null default 0.15,     -- 15% GCT
  labor_rate      numeric(12,2) not null default 3000,    -- per hour, garage default
  timezone        text not null default 'America/Jamaica',
  opening_hours   jsonb not null default '{}'::jsonb,
  status          garage_status not null default 'trial',
  plan_id         uuid references public.subscription_plans(id),
  trial_ends_at   timestamptz default (now() + interval '30 days'),
  brand           jsonb not null default '{}'::jsonb,     -- { primaryColor, productName }
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_garages_updated before update on public.garages
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  phone          text,
  avatar_url     text,
  platform_role  platform_role,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when an auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Memberships (user <-> garage, with role)
-- ----------------------------------------------------------------------------
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  garage_id   uuid not null references public.garages(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        membership_role not null,
  status      membership_status not null default 'active',
  -- optional technician settings
  labor_rate  numeric(12,2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (garage_id, user_id)
);
create index if not exists idx_memberships_user on public.memberships(user_id) where status = 'active';
create index if not exists idx_memberships_garage on public.memberships(garage_id);
create trigger trg_memberships_updated before update on public.memberships
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Invitations
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  garage_id   uuid not null references public.garages(id) on delete cascade,
  email       citext not null,
  role        membership_role not null,
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid references auth.users(id),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_invitations_garage on public.invitations(garage_id);
create index if not exists idx_invitations_email on public.invitations(email);

-- ----------------------------------------------------------------------------
-- Per-garage settings blob (checklists, templates, integrations)
-- ----------------------------------------------------------------------------
create table if not exists public.garage_settings (
  garage_id            uuid primary key references public.garages(id) on delete cascade,
  checklists           jsonb not null default '{}'::jsonb,   -- checkin/inspection/repair/quality/checkout
  document_templates   jsonb not null default '{}'::jsonb,
  notification_config  jsonb not null default '{}'::jsonb,   -- { email, sms, whatsapp providers }
  payment_methods      jsonb not null default '["cash","card","bank_transfer"]'::jsonb,
  allow_negative_stock boolean not null default false,
  updated_at           timestamptz not null default now()
);
create trigger trg_garage_settings_updated before update on public.garage_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Audit log
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  garage_id    uuid references public.garages(id) on delete cascade,
  user_id      uuid references auth.users(id),
  actor_name   text,
  action       text not null,
  entity_type  text,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_garage_created on public.audit_logs(garage_id, created_at desc);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id);

-- ============================================================================
-- RLS helper functions (SECURITY DEFINER — avoid policy recursion)
-- ============================================================================
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin');
$$;

create or replace function public.user_garage_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select garage_id from public.memberships where user_id = auth.uid() and status = 'active';
$$;

create or replace function public.has_garage_role(g uuid, roles membership_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and garage_id = g and status = 'active' and role = any(roles)
  );
$$;

create or replace function public.is_garage_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and garage_id = g and status = 'active'
  );
$$;

-- ============================================================================
-- Enable RLS + policies
-- ============================================================================
alter table public.subscription_plans enable row level security;
alter table public.garages            enable row level security;
alter table public.profiles           enable row level security;
alter table public.memberships        enable row level security;
alter table public.invitations        enable row level security;
alter table public.garage_settings    enable row level security;
alter table public.audit_logs         enable row level security;

-- Plans: readable by any authenticated user; writable only by platform admin
create policy plans_read on public.subscription_plans
  for select to authenticated using (true);
create policy plans_admin_write on public.subscription_plans
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Profiles: a user sees/edits own; platform admin sees all;
-- garage admins/supervisors can see profiles of co-members (for staff lists)
create policy profiles_self_read on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.memberships m1
      join public.memberships m2 on m2.garage_id = m1.garage_id
      where m1.user_id = auth.uid() and m1.status = 'active'
        and m2.user_id = public.profiles.id and m2.status = 'active'
    )
  );
create policy profiles_self_write on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Garages: members can read; garage_admin can update; platform admin full;
-- any authenticated user can insert (onboarding creates a garage for themselves)
create policy garages_read on public.garages
  for select to authenticated using (public.is_garage_member(id) or public.is_platform_admin());
create policy garages_insert on public.garages
  for insert to authenticated with check (true);
create policy garages_update on public.garages
  for update to authenticated using (public.has_garage_role(id, array['garage_admin']::membership_role[]) or public.is_platform_admin())
  with check (public.has_garage_role(id, array['garage_admin']::membership_role[]) or public.is_platform_admin());
create policy garages_platform_delete on public.garages
  for delete to authenticated using (public.is_platform_admin());

-- Memberships: user sees own rows; members see co-members; admins manage; platform full.
create policy memberships_read on public.memberships
  for select to authenticated using (
    user_id = auth.uid() or public.is_garage_member(garage_id) or public.is_platform_admin()
  );
-- Insert: the person may add THEMSELVES as garage_admin during onboarding (no membership yet),
-- OR an existing garage_admin may add staff.
create policy memberships_insert on public.memberships
  for insert to authenticated with check (
    (user_id = auth.uid() and role = 'garage_admin'
       and not exists (select 1 from public.memberships m where m.garage_id = memberships.garage_id))
    or public.has_garage_role(garage_id, array['garage_admin']::membership_role[])
    or public.is_platform_admin()
  );
create policy memberships_update on public.memberships
  for update to authenticated using (
    public.has_garage_role(garage_id, array['garage_admin']::membership_role[]) or public.is_platform_admin()
  ) with check (
    public.has_garage_role(garage_id, array['garage_admin']::membership_role[]) or public.is_platform_admin()
  );
create policy memberships_delete on public.memberships
  for delete to authenticated using (
    public.has_garage_role(garage_id, array['garage_admin']::membership_role[]) or public.is_platform_admin()
  );

-- Invitations: garage admins manage; members can read
create policy invitations_manage on public.invitations
  for all to authenticated using (
    public.has_garage_role(garage_id, array['garage_admin']::membership_role[]) or public.is_platform_admin()
  ) with check (
    public.has_garage_role(garage_id, array['garage_admin']::membership_role[]) or public.is_platform_admin()
  );

-- Garage settings: members read; garage_admin writes
create policy garage_settings_read on public.garage_settings
  for select to authenticated using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy garage_settings_write on public.garage_settings
  for all to authenticated using (
    public.has_garage_role(garage_id, array['garage_admin']::membership_role[]) or public.is_platform_admin()
  ) with check (
    public.has_garage_role(garage_id, array['garage_admin']::membership_role[]) or public.is_platform_admin()
  );

-- Audit logs: members with admin/supervisor read; insert by any member; never update/delete
create policy audit_read on public.audit_logs
  for select to authenticated using (
    public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[])
    or public.is_platform_admin()
  );
create policy audit_insert on public.audit_logs
  for insert to authenticated with check (
    garage_id is null or public.is_garage_member(garage_id) or public.is_platform_admin()
  );

-- ============================================================================
-- Onboarding RPC — create a garage + admin membership + settings atomically
-- ============================================================================
create or replace function public.create_garage(
  p_name text,
  p_slug text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_currency text default 'JMD'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
  v_plan_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_plan_id from public.subscription_plans where code = 'free' limit 1;

  insert into public.garages (name, slug, phone, email, address, currency, plan_id)
  values (p_name, lower(p_slug), p_phone, p_email, p_address, coalesce(p_currency,'JMD'), v_plan_id)
  returning id into v_garage_id;

  insert into public.memberships (garage_id, user_id, role, status)
  values (v_garage_id, auth.uid(), 'garage_admin', 'active');

  insert into public.garage_settings (garage_id) values (v_garage_id)
  on conflict (garage_id) do nothing;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_garage_id, auth.uid(), 'garage.created', 'garage', v_garage_id::text,
          jsonb_build_object('name', p_name, 'slug', lower(p_slug)));

  return v_garage_id;
end $$;

grant execute on function public.create_garage(text,text,text,text,text,text) to authenticated;

-- ============================================================================
-- Seed subscription plans
-- ============================================================================
insert into public.subscription_plans (code, name, price_monthly, price_annual, limits, features, sort_order)
values
  ('free',       'Free',        0,      0,      '{"users":3,"vehicles":50,"storage_mb":500}',      '{"reports":false,"customer_portal":false,"inventory":true}', 0),
  ('basic',      'Basic',       6500,   65000,  '{"users":8,"vehicles":500,"storage_mb":5000}',    '{"reports":true,"customer_portal":true,"inventory":true}', 1),
  ('pro',        'Pro',         14000,  140000, '{"users":25,"vehicles":5000,"storage_mb":25000}', '{"reports":true,"customer_portal":true,"inventory":true,"api":true}', 2),
  ('enterprise', 'Enterprise',  0,      0,      '{"users":-1,"vehicles":-1,"storage_mb":-1}',      '{"reports":true,"customer_portal":true,"inventory":true,"api":true,"sso":true}', 3)
on conflict (code) do nothing;

-- >>>> FILE: migrations/0002_vehicles_workorders.sql

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

-- >>>> FILE: migrations/0003_workshop.sql

-- ============================================================================
-- GarageFlow — 0003 Workshop: services, tasks, technician assignments, time
-- ============================================================================

do $$ begin
  create type task_status as enum ('not_started','in_progress','completed','unable');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Service catalogue
-- ----------------------------------------------------------------------------
create table if not exists public.service_categories (
  id        uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  name      text not null,
  sort_order int not null default 0,
  unique (garage_id, name)
);

create table if not exists public.services (
  id                uuid primary key default gen_random_uuid(),
  garage_id         uuid not null references public.garages(id) on delete cascade,
  category_id       uuid references public.service_categories(id) on delete set null,
  category          text,
  name              text not null,
  description       text,
  default_price     numeric(12,2) not null default 0,
  est_labor_minutes int not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_services_garage on public.services(garage_id) where active;
create trigger trg_services_updated before update on public.services
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Repair checklist templates (customisable) — stored per garage
-- ----------------------------------------------------------------------------
create table if not exists public.checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  garage_id  uuid not null references public.garages(id) on delete cascade,
  kind       text not null,   -- checkin | inspection | repair | quality | checkout
  name       text not null,
  items      jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_checklist_templates_garage on public.checklist_templates(garage_id, kind);

-- ----------------------------------------------------------------------------
-- Work order tasks
-- ----------------------------------------------------------------------------
create table if not exists public.work_order_tasks (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  title         text not null,
  detail        text,
  status        task_status not null default 'not_started',
  unable_reason text,
  assigned_to   uuid references auth.users(id),
  sequence      int not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_tasks_wo on public.work_order_tasks(work_order_id);
create index if not exists idx_tasks_assignee on public.work_order_tasks(assigned_to);
create trigger trg_tasks_updated before update on public.work_order_tasks
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Technician assignments (many technicians per work order)
-- ----------------------------------------------------------------------------
create table if not exists public.technician_assignments (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  scope         text,           -- "Engine repair", "Electrical", ...
  assigned_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (work_order_id, technician_id)
);
create index if not exists idx_assign_wo on public.technician_assignments(work_order_id);
create index if not exists idx_assign_tech on public.technician_assignments(technician_id);

-- ----------------------------------------------------------------------------
-- Time entries (multiple work sessions per technician/task)
-- ----------------------------------------------------------------------------
create table if not exists public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  garage_id        uuid not null references public.garages(id) on delete cascade,
  work_order_id    uuid not null references public.work_orders(id) on delete cascade,
  task_id          uuid references public.work_order_tasks(id) on delete set null,
  technician_id    uuid not null references auth.users(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int generated always as (
    case when ended_at is null then null else greatest(0, extract(epoch from (ended_at - started_at))::int) end
  ) stored,
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_time_wo on public.time_entries(work_order_id);
create index if not exists idx_time_tech on public.time_entries(technician_id);
create unique index if not exists uq_time_open_per_tech on public.time_entries(technician_id)
  where ended_at is null;

-- ----------------------------------------------------------------------------
-- Work order labour lines (manual labour charges, independent of parts/services)
-- ----------------------------------------------------------------------------
create table if not exists public.work_order_labor (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  description   text not null,
  hours         numeric(8,2) not null default 0,
  rate          numeric(12,2) not null default 0,
  amount        numeric(12,2) generated always as (round(hours * rate, 2)) stored,
  technician_id uuid references auth.users(id),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_labor_wo on public.work_order_labor(work_order_id);

-- ----------------------------------------------------------------------------
-- Work order service lines (from catalogue, price editable)
-- ----------------------------------------------------------------------------
create table if not exists public.work_order_services (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  service_id    uuid references public.services(id) on delete set null,
  description   text not null,
  quantity      numeric(8,2) not null default 1,
  unit_price    numeric(12,2) not null default 0,
  amount        numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_services_wo on public.work_order_services(work_order_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.service_categories      enable row level security;
alter table public.services                enable row level security;
alter table public.checklist_templates     enable row level security;
alter table public.work_order_tasks        enable row level security;
alter table public.technician_assignments  enable row level security;
alter table public.time_entries            enable row level security;
alter table public.work_order_labor        enable row level security;
alter table public.work_order_services     enable row level security;

-- Catalogue: members read; admin/supervisor manage
create policy svc_cat_read on public.service_categories for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy svc_cat_write on public.service_categories for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

create policy svc_read on public.services for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy svc_write on public.services for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

create policy clt_read on public.checklist_templates for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy clt_write on public.checklist_templates for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

-- Tasks: members read; supervisor/admin manage; assigned technician may update own
create policy task_read on public.work_order_tasks for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy task_write_mgr on public.work_order_tasks for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));
create policy task_update_tech on public.work_order_tasks for update to authenticated
  using (assigned_to = auth.uid() and public.is_garage_member(garage_id))
  with check (assigned_to = auth.uid() and public.is_garage_member(garage_id));

-- Assignments: members read; supervisor/admin manage
create policy assign_read on public.technician_assignments for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy assign_write on public.technician_assignments for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

-- Time entries: members read; technician manages own; supervisor/admin manage all
create policy time_read on public.time_entries for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy time_write_own on public.time_entries for all to authenticated
  using (technician_id = auth.uid() and public.is_garage_member(garage_id))
  with check (technician_id = auth.uid() and public.is_garage_member(garage_id));
create policy time_write_mgr on public.time_entries for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

-- Labor + service lines: members read; admin/supervisor/receptionist write
create policy wol_read on public.work_order_labor for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy wol_write on public.work_order_labor for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

create policy wos_read on public.work_order_services for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy wos_write on public.work_order_services for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

-- ============================================================================
-- Time tracking RPCs
-- ============================================================================
create or replace function public.start_time_entry(p_work_order uuid, p_task uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_garage uuid; v_id uuid;
begin
  select garage_id into v_garage from public.work_orders where id = p_work_order;
  if v_garage is null or not public.is_garage_member(v_garage) then
    raise exception 'not authorized';
  end if;
  -- close any open entry for this technician
  update public.time_entries set ended_at = now()
    where technician_id = auth.uid() and ended_at is null;
  insert into public.time_entries (garage_id, work_order_id, task_id, technician_id, note)
  values (v_garage, p_work_order, p_task, auth.uid(), p_note)
  returning id into v_id;
  update public.work_orders set status = 'in_progress'
    where id = p_work_order and status in ('assigned','assignment_pending','inspected','awaiting_parts');
  return v_id;
end $$;

create or replace function public.stop_time_entry(p_entry uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.time_entries set ended_at = now()
   where technician_id = auth.uid() and ended_at is null
     and (p_entry is null or id = p_entry);
end $$;

grant execute on function public.start_time_entry(uuid, uuid, text) to authenticated;
grant execute on function public.stop_time_entry(uuid) to authenticated;

-- >>>> FILE: migrations/0004_approvals_notifications.sql

-- ============================================================================
-- GarageFlow — 0004 Additional work, customer approvals, overrides, notifications
-- ============================================================================

do $$ begin
  create type approval_status as enum ('pending','approved','declined','overridden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type override_kind as enum ('additional_work','checkout','price_change','negative_stock');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Additional work requests
-- ----------------------------------------------------------------------------
create table if not exists public.additional_work_requests (
  id             uuid primary key default gen_random_uuid(),
  garage_id      uuid not null references public.garages(id) on delete cascade,
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  problem        text not null,
  recommendation text,
  parts_estimate numeric(12,2) not null default 0,
  labor_estimate numeric(12,2) not null default 0,
  price          numeric(12,2) not null default 0,
  photos         jsonb not null default '[]'::jsonb,
  technician_notes text,
  requested_by   uuid references auth.users(id),
  status         approval_status not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_awr_wo on public.additional_work_requests(work_order_id);
create index if not exists idx_awr_status on public.additional_work_requests(garage_id, status);
create trigger trg_awr_updated before update on public.additional_work_requests
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Customer approvals (decision record)
-- ----------------------------------------------------------------------------
create table if not exists public.customer_approvals (
  id                 uuid primary key default gen_random_uuid(),
  garage_id          uuid not null references public.garages(id) on delete cascade,
  request_id         uuid not null references public.additional_work_requests(id) on delete cascade,
  decision           text not null,        -- approved | declined
  amount             numeric(12,2) not null default 0,
  method             text,                 -- in_person | phone | sms | whatsapp | portal | email
  customer_signature text,
  notes              text,
  recorded_by        uuid references auth.users(id),
  decided_at         timestamptz not null default now()
);
create index if not exists idx_capprovals_request on public.customer_approvals(request_id);

-- ----------------------------------------------------------------------------
-- Authorised overrides (audit-heavy)
-- ----------------------------------------------------------------------------
create table if not exists public.overrides (
  id             uuid primary key default gen_random_uuid(),
  garage_id      uuid not null references public.garages(id) on delete cascade,
  kind           override_kind not null,
  work_order_id  uuid references public.work_orders(id) on delete cascade,
  request_id     uuid references public.additional_work_requests(id) on delete set null,
  reason         text not null,
  amount         numeric(12,2),
  details        jsonb not null default '{}'::jsonb,
  authorized_by  uuid not null references auth.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_overrides_wo on public.overrides(work_order_id);

-- ----------------------------------------------------------------------------
-- Internal notification centre (role/user aware)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  garage_id   uuid not null references public.garages(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,   -- null => role broadcast
  roles       membership_role[],                                  -- target roles when user_id null
  title       text not null,
  body        text,
  entity_type text,
  entity_id   text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id) where read_at is null;
create index if not exists idx_notif_garage on public.notifications(garage_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Outbound customer notifications (email/sms/whatsapp) — provider-agnostic queue
-- ----------------------------------------------------------------------------
create table if not exists public.customer_messages (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  customer_id   uuid references public.customers(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  channel       text not null,          -- email | sms | whatsapp
  template      text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued',   -- queued | sent | failed | mock
  provider      text,
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cust_msg_garage on public.customer_messages(garage_id, created_at desc);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.additional_work_requests enable row level security;
alter table public.customer_approvals       enable row level security;
alter table public.overrides                enable row level security;
alter table public.notifications            enable row level security;
alter table public.customer_messages        enable row level security;

-- Additional work: members read; technician can create + edit own pending;
-- supervisor/admin manage
create policy awr_read on public.additional_work_requests for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy awr_tech_insert on public.additional_work_requests for insert to authenticated
  with check (public.is_garage_member(garage_id) and requested_by = auth.uid());
create policy awr_tech_update on public.additional_work_requests for update to authenticated
  using (requested_by = auth.uid() and status = 'pending' and public.is_garage_member(garage_id))
  with check (requested_by = auth.uid() and public.is_garage_member(garage_id));
create policy awr_mgr on public.additional_work_requests for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

-- Customer approvals: members read; supervisor/admin/receptionist record
-- (a technician may NOT record approval for their own request — enforced in RPC)
create policy capprovals_read on public.customer_approvals for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy capprovals_write on public.customer_approvals for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

-- Overrides: admin/supervisor create; members read
create policy overrides_read on public.overrides for select to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]) or public.is_platform_admin());
create policy overrides_write on public.overrides for insert to authenticated
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[])
              and authorized_by = auth.uid());

-- Notifications: a user sees their own or role-targeted; system/app inserts
create policy notif_read on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    or (user_id is null and public.is_garage_member(garage_id)
        and exists (select 1 from public.memberships m
                    where m.user_id = auth.uid() and m.garage_id = notifications.garage_id
                      and m.status = 'active' and (notifications.roles is null or m.role = any(notifications.roles))))
    or public.is_platform_admin()
  );
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid() or public.is_garage_member(garage_id))
  with check (user_id = auth.uid() or public.is_garage_member(garage_id));
create policy notif_insert on public.notifications for insert to authenticated
  with check (public.is_garage_member(garage_id) or public.is_platform_admin());

create policy cust_msg_read on public.customer_messages for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy cust_msg_write on public.customer_messages for all to authenticated
  using (public.is_garage_member(garage_id)) with check (public.is_garage_member(garage_id));

-- ============================================================================
-- Approval RPCs
-- ============================================================================
-- Record a customer decision. Blocks the technician who raised the request.
create or replace function public.record_customer_approval(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_req public.additional_work_requests%rowtype;
  v_id uuid;
begin
  select * into v_req from public.additional_work_requests
    where id = (payload->>'request_id')::uuid;
  if v_req.id is null then raise exception 'request not found'; end if;

  if not public.has_garage_role(v_req.garage_id,
        array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized to record approvals';
  end if;
  if v_req.requested_by = auth.uid() then
    raise exception 'you cannot approve additional work that you requested';
  end if;

  insert into public.customer_approvals (garage_id, request_id, decision, amount, method,
                                         customer_signature, notes, recorded_by)
  values (v_req.garage_id, v_req.id, payload->>'decision',
          coalesce(nullif(payload->>'amount','')::numeric, v_req.price),
          payload->>'method', payload->>'customer_signature', payload->>'notes', auth.uid())
  returning id into v_id;

  update public.additional_work_requests
    set status = case when payload->>'decision' = 'approved' then 'approved' else 'declined' end
    where id = v_req.id;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_req.garage_id, auth.uid(), 'additional_work.' || (payload->>'decision'),
          'additional_work_request', v_req.id::text,
          jsonb_build_object('amount', payload->>'amount', 'method', payload->>'method'));

  return v_id;
end $$;

-- Admin/supervisor override for additional work OR checkout.
create or replace function public.create_override(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_garage uuid; v_id uuid;
begin
  v_garage := (payload->>'garage_id')::uuid;
  if not public.has_garage_role(v_garage, array['garage_admin','supervisor']::membership_role[]) then
    raise exception 'not authorized to perform overrides';
  end if;
  if coalesce(trim(payload->>'reason'),'') = '' then
    raise exception 'override reason is required';
  end if;

  insert into public.overrides (garage_id, kind, work_order_id, request_id, reason, amount, details, authorized_by)
  values (v_garage, (payload->>'kind')::override_kind,
          nullif(payload->>'work_order_id','')::uuid, nullif(payload->>'request_id','')::uuid,
          payload->>'reason', nullif(payload->>'amount','')::numeric,
          coalesce(payload->'details','{}'::jsonb), auth.uid())
  returning id into v_id;

  if (payload->>'kind') = 'additional_work' and nullif(payload->>'request_id','') is not null then
    update public.additional_work_requests set status = 'overridden'
      where id = (payload->>'request_id')::uuid;
  end if;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, reason, after)
  values (v_garage, auth.uid(), 'override.' || (payload->>'kind'), 'override', v_id::text,
          payload->>'reason', jsonb_build_object('amount', payload->>'amount'));

  return v_id;
end $$;

grant execute on function public.record_customer_approval(jsonb) to authenticated;
grant execute on function public.create_override(jsonb) to authenticated;

-- >>>> FILE: migrations/0005_inventory.sql

-- ============================================================================
-- GarageFlow — 0005 Suppliers, Parts, Inventory transactions, Work-order parts
-- ============================================================================

do $$ begin
  create type inventory_txn_type as enum ('receive','add','remove','adjust','use','return');
exception when duplicate_object then null; end $$;

create table if not exists public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  garage_id      uuid not null references public.garages(id) on delete cascade,
  name           text not null,
  contact_person text,
  phone          text,
  email          citext,
  address        text,
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_suppliers_garage on public.suppliers(garage_id) where deleted_at is null;
create trigger trg_suppliers_updated before update on public.suppliers
  for each row execute function public.set_updated_at();

create table if not exists public.parts (
  id           uuid primary key default gen_random_uuid(),
  garage_id    uuid not null references public.garages(id) on delete cascade,
  name         text not null,
  part_number  text,
  category     text,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  fitment      text,                 -- compatible vehicles (free text for v1)
  cost         numeric(12,2) not null default 0,
  price        numeric(12,2) not null default 0,
  quantity     numeric(12,2) not null default 0,
  min_stock    numeric(12,2) not null default 0,
  location     text,
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_parts_garage on public.parts(garage_id) where deleted_at is null;
create unique index if not exists uq_parts_number on public.parts(garage_id, upper(part_number))
  where deleted_at is null and part_number is not null and part_number <> '';
create index if not exists idx_parts_low_stock on public.parts(garage_id)
  where deleted_at is null and quantity <= min_stock;
create trigger trg_parts_updated before update on public.parts
  for each row execute function public.set_updated_at();

create table if not exists public.inventory_transactions (
  id             uuid primary key default gen_random_uuid(),
  garage_id      uuid not null references public.garages(id) on delete cascade,
  part_id        uuid not null references public.parts(id) on delete cascade,
  type           inventory_txn_type not null,
  quantity_delta numeric(12,2) not null,       -- signed
  quantity_after numeric(12,2) not null,
  unit_cost      numeric(12,2),
  work_order_id  uuid references public.work_orders(id) on delete set null,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  reference      text,
  note           text,
  user_id        uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_inv_txn_part on public.inventory_transactions(part_id, created_at desc);
create index if not exists idx_inv_txn_garage on public.inventory_transactions(garage_id, created_at desc);

create table if not exists public.work_order_parts (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  part_id       uuid references public.parts(id) on delete set null,
  description   text not null,
  quantity      numeric(12,2) not null default 1,
  unit_price    numeric(12,2) not null default 0,
  unit_cost     numeric(12,2) not null default 0,
  amount        numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  added_by      uuid references auth.users(id),
  txn_id        uuid references public.inventory_transactions(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wo_parts_wo on public.work_order_parts(work_order_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.suppliers               enable row level security;
alter table public.parts                   enable row level security;
alter table public.inventory_transactions  enable row level security;
alter table public.work_order_parts        enable row level security;

create policy suppliers_read on public.suppliers for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy suppliers_write on public.suppliers for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

create policy parts_read on public.parts for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy parts_write on public.parts for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

create policy inv_txn_read on public.inventory_transactions for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy inv_txn_insert on public.inventory_transactions for insert to authenticated
  with check (public.is_garage_member(garage_id));

create policy wo_parts_read on public.work_order_parts for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy wo_parts_write on public.work_order_parts for all to authenticated
  using (public.is_garage_member(garage_id)) with check (public.is_garage_member(garage_id));

-- ============================================================================
-- Inventory RPCs
-- ============================================================================
-- Generic stock movement (receive/add/remove/adjust)
create or replace function public.adjust_stock(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_part public.parts%rowtype;
  v_delta numeric(12,2);
  v_new numeric(12,2);
  v_allow_neg boolean;
  v_txn uuid;
begin
  select * into v_part from public.parts where id = (payload->>'part_id')::uuid;
  if v_part.id is null then raise exception 'part not found'; end if;
  if not public.has_garage_role(v_part.garage_id, array['garage_admin','supervisor']::membership_role[]) then
    raise exception 'not authorized to adjust stock';
  end if;

  v_delta := (payload->>'quantity_delta')::numeric;
  v_new := v_part.quantity + v_delta;
  select allow_negative_stock into v_allow_neg from public.garage_settings where garage_id = v_part.garage_id;
  if v_new < 0 and not coalesce(v_allow_neg, false) then
    raise exception 'insufficient stock: % available, % requested', v_part.quantity, abs(v_delta);
  end if;

  update public.parts set quantity = v_new where id = v_part.id;

  insert into public.inventory_transactions (garage_id, part_id, type, quantity_delta, quantity_after,
                                             unit_cost, supplier_id, reference, note, user_id)
  values (v_part.garage_id, v_part.id, (payload->>'type')::inventory_txn_type, v_delta, v_new,
          nullif(payload->>'unit_cost','')::numeric, nullif(payload->>'supplier_id','')::uuid,
          payload->>'reference', payload->>'note', auth.uid())
  returning id into v_txn;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, before, after)
  values (v_part.garage_id, auth.uid(), 'inventory.' || (payload->>'type'), 'part', v_part.id::text,
          jsonb_build_object('quantity', v_part.quantity), jsonb_build_object('quantity', v_new));

  return v_txn;
end $$;

-- Add a part to a work order and deduct inventory in one shot
create or replace function public.use_part_on_work_order(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_wo public.work_orders%rowtype;
  v_part public.parts%rowtype;
  v_qty numeric(12,2);
  v_price numeric(12,2);
  v_new numeric(12,2);
  v_allow_neg boolean;
  v_txn uuid;
  v_line uuid;
begin
  select * into v_wo from public.work_orders where id = (payload->>'work_order_id')::uuid;
  if v_wo.id is null or not public.is_garage_member(v_wo.garage_id) then
    raise exception 'not authorized';
  end if;
  v_qty := coalesce((payload->>'quantity')::numeric, 1);

  if nullif(payload->>'part_id','') is not null then
    select * into v_part from public.parts where id = (payload->>'part_id')::uuid;
    v_price := coalesce(nullif(payload->>'unit_price','')::numeric, v_part.price);
    v_new := v_part.quantity - v_qty;
    select allow_negative_stock into v_allow_neg from public.garage_settings where garage_id = v_wo.garage_id;
    if v_new < 0 and not coalesce(v_allow_neg, false) then
      raise exception 'insufficient stock for %: % available', v_part.name, v_part.quantity;
    end if;
    update public.parts set quantity = v_new where id = v_part.id;
    insert into public.inventory_transactions (garage_id, part_id, type, quantity_delta, quantity_after,
                                               unit_cost, work_order_id, note, user_id)
    values (v_wo.garage_id, v_part.id, 'use', -v_qty, v_new, v_part.cost, v_wo.id,
            'Used on ' || v_wo.number, auth.uid())
    returning id into v_txn;

    insert into public.work_order_parts (garage_id, work_order_id, part_id, description, quantity,
                                         unit_price, unit_cost, added_by, txn_id)
    values (v_wo.garage_id, v_wo.id, v_part.id, coalesce(payload->>'description', v_part.name),
            v_qty, v_price, v_part.cost, auth.uid(), v_txn)
    returning id into v_line;
  else
    -- ad-hoc part not tracked in inventory
    insert into public.work_order_parts (garage_id, work_order_id, description, quantity, unit_price, unit_cost, added_by)
    values (v_wo.garage_id, v_wo.id, payload->>'description', v_qty,
            coalesce(nullif(payload->>'unit_price','')::numeric, 0),
            coalesce(nullif(payload->>'unit_cost','')::numeric, 0), auth.uid())
    returning id into v_line;
  end if;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_wo.garage_id, auth.uid(), 'work_order.part_added', 'work_order', v_wo.id::text,
          jsonb_build_object('description', payload->>'description', 'quantity', v_qty));

  return v_line;
end $$;

grant execute on function public.adjust_stock(jsonb) to authenticated;
grant execute on function public.use_part_on_work_order(jsonb) to authenticated;

-- >>>> FILE: migrations/0006_billing_quality_checkout.sql

-- ============================================================================
-- GarageFlow — 0006 Invoices, Payments, Quality inspection, Checkout
-- ============================================================================

do $$ begin
  create type invoice_status as enum ('draft','unpaid','partial','paid','cancelled','refunded');
exception when duplicate_object then null; end $$;

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  number        text not null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  customer_id   uuid references public.customers(id),
  status        invoice_status not null default 'draft',
  subtotal      numeric(12,2) not null default 0,
  discount      numeric(12,2) not null default 0,
  tax_rate      numeric(6,4) not null default 0,
  tax           numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  paid_amount   numeric(12,2) not null default 0,
  balance       numeric(12,2) not null default 0,
  notes         text,
  issued_at     timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (garage_id, number)
);
create index if not exists idx_invoices_garage_status on public.invoices(garage_id, status);
create index if not exists idx_invoices_wo on public.invoices(work_order_id);
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  garage_id   uuid not null references public.garages(id) on delete cascade,
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  kind        text not null,   -- labor | part | service | other | discount
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  amount      numeric(12,2) not null default 0,
  source_type text,            -- work_order_parts | work_order_labor | work_order_services
  source_id   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_invoice_items_invoice on public.invoice_items(invoice_id);

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  garage_id    uuid not null references public.garages(id) on delete cascade,
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  amount       numeric(12,2) not null,
  method       text not null,      -- cash | card | bank_transfer | online
  reference    text,
  received_by  uuid references auth.users(id),
  notes        text,
  is_refund    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_payments_invoice on public.payments(invoice_id);
create index if not exists idx_payments_garage on public.payments(garage_id, created_at desc);

create table if not exists public.quality_inspections (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  checklist     jsonb not null default '[]'::jsonb,
  passed        boolean not null default false,
  notes         text,
  photos        jsonb not null default '[]'::jsonb,
  supervisor_id uuid references auth.users(id),
  signature     text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_qc_wo on public.quality_inspections(work_order_id);

create table if not exists public.checkouts (
  id                 uuid primary key default gen_random_uuid(),
  garage_id          uuid not null references public.garages(id) on delete cascade,
  work_order_id      uuid not null references public.work_orders(id) on delete cascade,
  checklist          jsonb not null default '[]'::jsonb,
  collected_by_name  text not null,
  relationship       text,
  id_verified        boolean not null default false,
  released_by        uuid references auth.users(id),
  customer_signature text,
  override_id        uuid references public.overrides(id) on delete set null,
  final_mileage      int,
  notes              text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_checkout_wo on public.checkouts(work_order_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.invoices             enable row level security;
alter table public.invoice_items        enable row level security;
alter table public.payments             enable row level security;
alter table public.quality_inspections  enable row level security;
alter table public.checkouts            enable row level security;

-- Invoices: members read; admin/supervisor/receptionist manage
create policy inv_read on public.invoices for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy inv_write on public.invoices for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

create policy inv_items_read on public.invoice_items for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy inv_items_write on public.invoice_items for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

-- Payments: members read; admin/supervisor/receptionist record; no update/delete via API
create policy pay_read on public.payments for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy pay_insert on public.payments for insert to authenticated
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[])
              and received_by = auth.uid());

create policy qc_read on public.quality_inspections for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy qc_write on public.quality_inspections for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

create policy checkout_read on public.checkouts for select to authenticated
  using (public.is_garage_member(garage_id) or public.is_platform_admin());
create policy checkout_write on public.checkouts for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor','receptionist']::membership_role[]));

-- ============================================================================
-- Billing engine
-- ============================================================================
-- Recalculate invoice totals + status from its items and payments
create or replace function public.recalc_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub numeric(12,2);
  v_disc numeric(12,2);
  v_paid numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_rate numeric(6,4);
  v_status invoice_status;
begin
  select coalesce(sum(case when kind = 'discount' then 0 else amount end),0),
         coalesce(sum(case when kind = 'discount' then amount else 0 end),0)
    into v_sub, v_disc
    from public.invoice_items where invoice_id = p_invoice;

  select coalesce(sum(case when is_refund then -amount else amount end),0)
    into v_paid from public.payments where invoice_id = p_invoice;

  select tax_rate, status into v_rate, v_status from public.invoices where id = p_invoice;
  v_tax := round((v_sub - v_disc) * coalesce(v_rate,0), 2);
  v_total := (v_sub - v_disc) + v_tax;

  if v_status not in ('cancelled','refunded','draft') then
    if v_paid <= 0 then v_status := 'unpaid';
    elsif v_paid < v_total then v_status := 'partial';
    else v_status := 'paid';
    end if;
  end if;

  update public.invoices
    set subtotal = v_sub, discount = v_disc, tax = v_tax, total = v_total,
        paid_amount = v_paid, balance = v_total - v_paid, status = v_status
    where id = p_invoice;
end $$;

create or replace function public._trg_recalc_invoice_items()
returns trigger language plpgsql as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;
create trigger trg_recalc_on_items
  after insert or update or delete on public.invoice_items
  for each row execute function public._trg_recalc_invoice_items();

create or replace function public._trg_recalc_invoice_payments()
returns trigger language plpgsql as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (coalesce(new.garage_id, old.garage_id), auth.uid(),
          case when tg_op = 'INSERT' then 'payment.recorded' else 'payment.changed' end,
          'invoice', coalesce(new.invoice_id, old.invoice_id)::text,
          jsonb_build_object('amount', coalesce(new.amount, old.amount), 'method', coalesce(new.method, old.method)));
  return null;
end $$;
create trigger trg_recalc_on_payments
  after insert or update or delete on public.payments
  for each row execute function public._trg_recalc_invoice_payments();

-- Build (or rebuild) a draft invoice from a work order's parts/labour/services
create or replace function public.generate_invoice(p_work_order uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_wo public.work_orders%rowtype;
  v_inv uuid;
  v_seq bigint;
  v_number text;
  v_rate numeric(6,4);
begin
  select * into v_wo from public.work_orders where id = p_work_order;
  if v_wo.id is null or not public.has_garage_role(v_wo.garage_id,
       array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized';
  end if;

  select coalesce(g.tax_rate,0) into v_rate from public.garages g where g.id = v_wo.garage_id;

  select id into v_inv from public.invoices
    where work_order_id = p_work_order and status = 'draft' limit 1;

  if v_inv is null then
    v_seq := public.next_counter(v_wo.garage_id, 'invoice:' || to_char(now(),'YYYY'));
    v_number := 'INV-' || to_char(now(),'YYYY') || '-' || lpad(v_seq::text, 6, '0');
    insert into public.invoices (garage_id, number, work_order_id, customer_id, status, tax_rate, created_by)
    values (v_wo.garage_id, v_number, p_work_order, v_wo.customer_id, 'draft', v_rate, auth.uid())
    returning id into v_inv;
  end if;

  delete from public.invoice_items where invoice_id = v_inv;

  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
  select garage_id, v_inv, 'part', description, quantity, unit_price, amount, 'work_order_parts', id
    from public.work_order_parts where work_order_id = p_work_order;

  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
  select garage_id, v_inv, 'labor', description, hours, rate, amount, 'work_order_labor', id
    from public.work_order_labor where work_order_id = p_work_order;

  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
  select garage_id, v_inv, 'service', description, quantity, unit_price, amount, 'work_order_services', id
    from public.work_order_services where work_order_id = p_work_order;

  perform public.recalc_invoice(v_inv);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id)
  values (v_wo.garage_id, auth.uid(), 'invoice.generated', 'invoice', v_inv::text);

  return v_inv;
end $$;

grant execute on function public.recalc_invoice(uuid) to authenticated;
grant execute on function public.generate_invoice(uuid) to authenticated;

-- ============================================================================
-- Guarded checkout
-- ============================================================================
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

-- >>>> FILE: migrations/0007_storage_and_views.sql

-- ============================================================================
-- GarageFlow — 0007 Storage bucket + policies, reporting views
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Storage: single private bucket, object path = {garage_id}/{entity}/{file}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garage-media', 'garage-media', false, 15728640,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "garage media read"   on storage.objects;
drop policy if exists "garage media insert" on storage.objects;
drop policy if exists "garage media update" on storage.objects;
drop policy if exists "garage media delete" on storage.objects;

create policy "garage media read" on storage.objects for select to authenticated
  using (
    bucket_id = 'garage-media'
    and (
      public.is_platform_admin()
      or (nullif(split_part(name, '/', 1), '')::uuid in (select public.user_garage_ids()))
    )
  );

create policy "garage media insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garage-media'
    and nullif(split_part(name, '/', 1), '')::uuid in (select public.user_garage_ids())
  );

create policy "garage media update" on storage.objects for update to authenticated
  using (
    bucket_id = 'garage-media'
    and nullif(split_part(name, '/', 1), '')::uuid in (select public.user_garage_ids())
  );

create policy "garage media delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'garage-media'
    and public.has_garage_role(nullif(split_part(name, '/', 1), '')::uuid,
                               array['garage_admin','supervisor']::membership_role[])
  );

-- ----------------------------------------------------------------------------
-- Dashboard / reporting views (RLS from base tables still applies)
-- ----------------------------------------------------------------------------
create or replace view public.v_work_order_financials as
select
  wo.id as work_order_id,
  wo.garage_id,
  coalesce((select sum(amount) from public.work_order_parts p where p.work_order_id = wo.id), 0) as parts_total,
  coalesce((select sum(unit_cost * quantity) from public.work_order_parts p where p.work_order_id = wo.id), 0) as parts_cost,
  coalesce((select sum(amount) from public.work_order_labor l where l.work_order_id = wo.id), 0) as labor_total,
  coalesce((select sum(amount) from public.work_order_services s where s.work_order_id = wo.id), 0) as services_total
from public.work_orders wo;

create or replace view public.v_technician_time as
select
  te.garage_id,
  te.technician_id,
  te.work_order_id,
  sum(coalesce(te.duration_seconds, 0)) as seconds,
  count(*) filter (where te.ended_at is null) as open_sessions
from public.time_entries te
group by te.garage_id, te.technician_id, te.work_order_id;

-- Platform-wide garage stats (platform admin only, enforced by function)
create or replace function public.platform_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'garages_total',    (select count(*) from public.garages),
    'garages_active',   (select count(*) from public.garages where status = 'active'),
    'garages_trial',    (select count(*) from public.garages where status = 'trial'),
    'garages_suspended',(select count(*) from public.garages where status = 'suspended'),
    'users_total',      (select count(*) from public.profiles),
    'work_orders_total',(select count(*) from public.work_orders),
    'revenue_total',    (select coalesce(sum(amount),0) from public.payments where not is_refund)
  ) into v;
  return v;
end $$;
grant execute on function public.platform_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- Invitation acceptance RPC (matches on email of current user)
-- ----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitations%rowtype;
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.invitations where token = p_token;
  if v_inv.id is null then raise exception 'invitation not found'; end if;
  if v_inv.accepted_at is not null then raise exception 'invitation already used'; end if;
  if v_inv.expires_at < now() then raise exception 'invitation expired'; end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'this invitation was sent to a different email address';
  end if;

  insert into public.memberships (garage_id, user_id, role, status)
  values (v_inv.garage_id, auth.uid(), v_inv.role, 'active')
  on conflict (garage_id, user_id) do update set role = excluded.role, status = 'active';

  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_inv.garage_id, auth.uid(), 'membership.joined', 'membership', auth.uid()::text,
          jsonb_build_object('role', v_inv.role));

  return v_inv.garage_id;
end $$;
grant execute on function public.accept_invitation(text) to authenticated;

-- >>>> FILE: migrations/0008_user_prefs.sql

-- ============================================================================
-- GarageFlow — 0008 user preferences: onboarding tour + service category column
-- ============================================================================

alter table public.profiles add column if not exists tour_completed_at timestamptz;
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- services.category (denormalised label alongside category_id) — also added in 0003
alter table public.services add column if not exists category text;

-- Let a user mark their own tour complete without a broader profile update path.
create or replace function public.complete_tour()
returns void language sql security definer set search_path = public as $$
  update public.profiles set tour_completed_at = now() where id = auth.uid();
$$;
grant execute on function public.complete_tour() to authenticated;

-- >>>> FILE: migrations/0009_customer_portal.sql

-- ============================================================================
-- GarageFlow — 0009 Customer portal
--
-- A customer can be linked to an auth user (customers.portal_user_id). Portal
-- users are NOT garage members; these policies let them read only their own
-- records across every garage that has linked them, and respond to additional
-- work requests on their own vehicles.
-- ============================================================================

-- Helper: the set of customer ids the current user owns via the portal
create or replace function public.portal_customer_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.customers where portal_user_id = auth.uid();
$$;
grant execute on function public.portal_customer_ids() to authenticated;

create or replace function public.portal_owns_work_order(p_wo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_orders w
    where w.id = p_wo and w.customer_id in (select public.portal_customer_ids())
  );
$$;

-- ---- read policies -------------------------------------------------------
drop policy if exists customers_portal_read on public.customers;
create policy customers_portal_read on public.customers for select to authenticated
  using (portal_user_id = auth.uid());

drop policy if exists vehicles_portal_read on public.vehicles;
create policy vehicles_portal_read on public.vehicles for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));

drop policy if exists wo_portal_read on public.work_orders;
create policy wo_portal_read on public.work_orders for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));

drop policy if exists insp_portal_read on public.inspections;
create policy insp_portal_read on public.inspections for select to authenticated
  using (public.portal_owns_work_order(work_order_id));

drop policy if exists dmg_portal_read on public.inspection_damages;
create policy dmg_portal_read on public.inspection_damages for select to authenticated
  using (exists (select 1 from public.inspections i where i.id = inspection_id and public.portal_owns_work_order(i.work_order_id)));

drop policy if exists photos_portal_read on public.vehicle_photos;
create policy photos_portal_read on public.vehicle_photos for select to authenticated
  using (work_order_id is not null and public.portal_owns_work_order(work_order_id));

drop policy if exists tasks_portal_read on public.work_order_tasks;
create policy tasks_portal_read on public.work_order_tasks for select to authenticated
  using (public.portal_owns_work_order(work_order_id));

drop policy if exists wo_parts_portal_read on public.work_order_parts;
create policy wo_parts_portal_read on public.work_order_parts for select to authenticated
  using (public.portal_owns_work_order(work_order_id));
drop policy if exists wo_labor_portal_read on public.work_order_labor;
create policy wo_labor_portal_read on public.work_order_labor for select to authenticated
  using (public.portal_owns_work_order(work_order_id));
drop policy if exists wo_services_portal_read on public.work_order_services;
create policy wo_services_portal_read on public.work_order_services for select to authenticated
  using (public.portal_owns_work_order(work_order_id));

drop policy if exists awr_portal_read on public.additional_work_requests;
create policy awr_portal_read on public.additional_work_requests for select to authenticated
  using (public.portal_owns_work_order(work_order_id));
drop policy if exists capprovals_portal_read on public.customer_approvals;
create policy capprovals_portal_read on public.customer_approvals for select to authenticated
  using (exists (select 1 from public.additional_work_requests r where r.id = request_id and public.portal_owns_work_order(r.work_order_id)));

drop policy if exists quality_portal_read on public.quality_inspections;
create policy quality_portal_read on public.quality_inspections for select to authenticated
  using (public.portal_owns_work_order(work_order_id));
drop policy if exists checkout_portal_read on public.checkouts;
create policy checkout_portal_read on public.checkouts for select to authenticated
  using (public.portal_owns_work_order(work_order_id));

drop policy if exists inv_portal_read on public.invoices;
create policy inv_portal_read on public.invoices for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));
drop policy if exists inv_items_portal_read on public.invoice_items;
create policy inv_items_portal_read on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.customer_id in (select public.portal_customer_ids())));
drop policy if exists pay_portal_read on public.payments;
create policy pay_portal_read on public.payments for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.customer_id in (select public.portal_customer_ids())));

-- ---- RPCs ---------------------------------------------------------------
-- Link every customer row that matches the caller's email and isn't yet linked.
create or replace function public.claim_portal_access()
returns int language plpgsql security definer set search_path = public as $$
declare v_email text; v_count int;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then raise exception 'not authenticated'; end if;

  update public.customers
    set portal_user_id = auth.uid()
    where lower(email) = lower(v_email) and portal_user_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function public.claim_portal_access() to authenticated;

-- A customer approves / declines additional work on their own vehicle.
create or replace function public.portal_respond_additional_work(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_req public.additional_work_requests%rowtype;
  v_id uuid;
begin
  select * into v_req from public.additional_work_requests where id = (payload->>'request_id')::uuid;
  if v_req.id is null then raise exception 'request not found'; end if;
  if not public.portal_owns_work_order(v_req.work_order_id) then
    raise exception 'not your vehicle';
  end if;
  if v_req.status <> 'pending' then raise exception 'already decided'; end if;

  insert into public.customer_approvals (garage_id, request_id, decision, amount, method, customer_signature, notes, recorded_by)
  values (v_req.garage_id, v_req.id, payload->>'decision', v_req.price, 'portal',
          payload->>'customer_signature', payload->>'notes', auth.uid())
  returning id into v_id;

  update public.additional_work_requests
    set status = case when payload->>'decision' = 'approved' then 'approved' else 'declined' end
    where id = v_req.id;

  -- resume work if this cleared the last pending request
  if not exists (
    select 1 from public.additional_work_requests
    where work_order_id = v_req.work_order_id and status = 'pending'
  ) then
    update public.work_orders set status = 'in_progress'
      where id = v_req.work_order_id and status = 'awaiting_customer_approval';
  end if;

  insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id)
  values (v_req.garage_id, array['garage_admin','supervisor','receptionist']::membership_role[],
          'Customer ' || (payload->>'decision') || ' additional work',
          v_req.problem, 'work_order', v_req.work_order_id::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_req.garage_id, auth.uid(), 'additional_work.portal_' || (payload->>'decision'),
          'additional_work_request', v_req.id::text, jsonb_build_object('via', 'portal'));

  return v_id;
end $$;
grant execute on function public.portal_respond_additional_work(jsonb) to authenticated;

-- >>>> FILE: migrations/0010_live_invoice.sql

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


-- ============================ 0011_appointment_requests.sql ============================

-- ============================================================================
-- GarageFlow — 0011 Customer self-service appointment requests
--
-- A customer creates a portal account, picks their garage from a public booking
-- link, and *requests* an appointment (preferred date/time + vehicle details +
-- photos). Staff either confirm that time or propose a different one; the
-- customer then accepts or declines the proposal.
--
-- The confirmed-appointment lifecycle still lives on appointments.status
-- (the appointment_status enum). The *request* lifecycle lives on a separate
-- text column so we never have to extend the enum inside a transaction.
-- ============================================================================

-- ---- garage: public booking ------------------------------------------------
alter table public.garages add column if not exists accepts_online_booking boolean not null default true;
alter table public.garages add column if not exists booking_slug text;

-- seed booking_slug from the existing slug where missing, keep it unique
update public.garages set booking_slug = slug::text where booking_slug is null;
create unique index if not exists idx_garages_booking_slug on public.garages(booking_slug);

-- ---- appointments: request fields -----------------------------------------
alter table public.appointments add column if not exists origin        text not null default 'staff'; -- staff | portal
alter table public.appointments add column if not exists request_state text;        -- null (staff) | pending | proposed | confirmed | declined | cancelled
alter table public.appointments add column if not exists requested_by  uuid references auth.users(id);
alter table public.appointments add column if not exists preferred_at  timestamptz; -- customer's original ask
alter table public.appointments add column if not exists proposed_at   timestamptz; -- staff counter-proposal
alter table public.appointments add column if not exists proposed_by   uuid references auth.users(id);
alter table public.appointments add column if not exists customer_note text;
alter table public.appointments add column if not exists staff_note    text;
alter table public.appointments add column if not exists photo_urls    text[] not null default '{}';
alter table public.appointments add column if not exists contact_name  text;
alter table public.appointments add column if not exists contact_phone text;

create index if not exists idx_appts_request_state on public.appointments(garage_id, request_state);
create index if not exists idx_appts_requested_by on public.appointments(requested_by);

-- ---- RLS: let a portal customer see their own requests --------------------
drop policy if exists appts_portal_read on public.appointments;
create policy appts_portal_read on public.appointments for select to authenticated
  using (
    requested_by = auth.uid()
    or customer_id in (select public.portal_customer_ids())
  );

-- ---- public booking-garage lookup ---------------------------------------
-- Exposes only the safe columns needed to render /book/<slug>.
create or replace function public.booking_garage(p_slug text)
returns table (id uuid, name text, phone text, address text, currency text, tax_label text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.phone, g.address, g.currency, g.tax_label
  from public.garages g
  where g.booking_slug = p_slug
    and g.accepts_online_booking
    and g.status <> 'cancelled'
$$;
grant execute on function public.booking_garage(text) to anon, authenticated;

-- List of garages a signed-in portal user could book with again (ones that
-- already know them) — handy for a "request another appointment" flow.
create or replace function public.my_booking_garages()
returns table (id uuid, name text, booking_slug text)
language sql stable security definer set search_path = public as $$
  select distinct g.id, g.name, g.booking_slug
  from public.garages g
  join public.customers c on c.garage_id = g.id
  where c.portal_user_id = auth.uid() and g.accepts_online_booking
$$;
grant execute on function public.my_booking_garages() to authenticated;

-- ---- RPC: customer requests an appointment ------------------------------
create or replace function public.portal_request_appointment(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_garage   public.garages%rowtype;
  v_email    text;
  v_uid      uuid := auth.uid();
  v_customer uuid;
  v_vehicle  uuid;
  v_appt     uuid;
  v_pref     timestamptz := nullif(payload->>'preferred_at','')::timestamptz;
  v_name     text := nullif(trim(payload->>'contact_name'),'');
  v_phone    text := nullif(trim(payload->>'contact_phone'),'');
  v_plate    text := nullif(trim(payload->>'license_plate'),'');
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_pref is null then raise exception 'a preferred date and time is required'; end if;

  select * into v_garage from public.garages
    where booking_slug = payload->>'booking_slug' and accepts_online_booking and status <> 'cancelled';
  if v_garage.id is null then raise exception 'garage not found or not accepting online bookings'; end if;

  select email into v_email from auth.users where id = v_uid;

  -- find-or-create the customer record inside this garage
  select id into v_customer from public.customers
    where garage_id = v_garage.id and lower(email) = lower(v_email) and deleted_at is null
    order by created_at limit 1;

  if v_customer is null then
    insert into public.customers (garage_id, name, phone, email, portal_user_id, created_by)
    values (v_garage.id, coalesce(v_name, v_email), v_phone, v_email, v_uid, v_uid)
    returning id into v_customer;
  else
    update public.customers
      set portal_user_id = coalesce(portal_user_id, v_uid),
          phone = coalesce(phone, v_phone)
      where id = v_customer;
  end if;

  -- match an existing vehicle by plate, else create one
  if v_plate is not null then
    select id into v_vehicle from public.vehicles
      where customer_id = v_customer and upper(replace(license_plate,' ','')) = upper(replace(v_plate,' ',''))
        and deleted_at is null
      limit 1;
  end if;

  if v_vehicle is null then
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate)
    values (v_garage.id, v_customer,
            nullif(trim(payload->>'make'),''), nullif(trim(payload->>'model'),''),
            nullif(payload->>'year','')::int, v_plate)
    returning id into v_vehicle;
  end if;

  insert into public.appointments
    (garage_id, customer_id, vehicle_id, service_id, title, scheduled_at, duration_min,
     status, origin, request_state, requested_by, preferred_at, customer_note,
     photo_urls, contact_name, contact_phone)
  values
    (v_garage.id, v_customer, v_vehicle, nullif(payload->>'service_id','')::uuid,
     coalesce(nullif(trim(payload->>'title'),''), 'Repair request'),
     v_pref, coalesce((payload->>'duration_min')::int, 60),
     'scheduled', 'portal', 'pending', v_uid, v_pref,
     nullif(trim(payload->>'customer_note'),''),
     coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(payload->'photo_urls','[]'::jsonb)) x), '{}'),
     v_name, v_phone)
  returning id into v_appt;

  insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id)
  values (v_garage.id, array['garage_admin','supervisor','receptionist']::membership_role[],
          'New appointment request',
          coalesce(v_name, v_email) || ' requested ' || to_char(v_pref, 'Dy DD Mon, HH12:MI am'),
          'appointment', v_appt::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_garage.id, v_uid, 'appointment.requested', 'appointment', v_appt::text,
          jsonb_build_object('preferred_at', v_pref, 'via', 'portal'));

  return v_appt;
end $$;
grant execute on function public.portal_request_appointment(jsonb) to authenticated;

-- ---- RPC: staff confirm or propose a new time --------------------------
create or replace function public.staff_respond_appointment_request(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments%rowtype;
  v_action text := payload->>'action';                     -- confirm | propose
  v_new   timestamptz := nullif(payload->>'proposed_at','')::timestamptz;
begin
  select * into v_appt from public.appointments where id = (payload->>'appointment_id')::uuid;
  if v_appt.id is null then raise exception 'appointment not found'; end if;
  if not public.has_garage_role(v_appt.garage_id,
       array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized';
  end if;
  if v_appt.request_state not in ('pending','proposed') then
    raise exception 'this request is already %', v_appt.request_state;
  end if;

  if v_action = 'confirm' then
    update public.appointments
      set request_state = 'confirmed', status = 'confirmed',
          staff_note = coalesce(nullif(trim(payload->>'staff_note'),''), staff_note),
          updated_at = now()
      where id = v_appt.id;

  elsif v_action = 'propose' then
    if v_new is null then raise exception 'a proposed time is required'; end if;
    update public.appointments
      set request_state = 'proposed', proposed_at = v_new, proposed_by = auth.uid(),
          scheduled_at = v_new,
          staff_note = coalesce(nullif(trim(payload->>'staff_note'),''), staff_note),
          updated_at = now()
      where id = v_appt.id;
  else
    raise exception 'unknown action %', v_action;
  end if;

  -- tell the customer (queued in customer_messages; picked up by the notifier)
  insert into public.customer_messages (garage_id, customer_id, channel, template, payload, status)
  values (v_appt.garage_id, v_appt.customer_id, 'email',
          case when v_action = 'confirm' then 'appointment_confirmed' else 'appointment_reschedule' end,
          jsonb_build_object('appointment_id', v_appt.id,
                             'when', coalesce(v_new, v_appt.scheduled_at)),
          'queued');

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_appt.garage_id, auth.uid(), 'appointment.' || v_action, 'appointment', v_appt.id::text,
          jsonb_build_object('proposed_at', v_new));
end $$;
grant execute on function public.staff_respond_appointment_request(jsonb) to authenticated;

-- ---- RPC: customer accepts or declines a proposed time ----------------
create or replace function public.portal_respond_appointment(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments%rowtype;
  v_decision text := payload->>'decision';                 -- accept | decline
begin
  select * into v_appt from public.appointments where id = (payload->>'appointment_id')::uuid;
  if v_appt.id is null then raise exception 'appointment not found'; end if;
  if v_appt.requested_by <> auth.uid()
     and v_appt.customer_id not in (select public.portal_customer_ids()) then
    raise exception 'not your appointment';
  end if;
  if v_appt.request_state not in ('pending','proposed') then
    raise exception 'nothing to respond to';
  end if;

  if v_decision = 'accept' then
    update public.appointments
      set request_state = 'confirmed', status = 'confirmed',
          scheduled_at = coalesce(proposed_at, scheduled_at), updated_at = now()
      where id = v_appt.id;
  elsif v_decision = 'decline' then
    update public.appointments
      set request_state = 'declined', status = 'cancelled', updated_at = now()
      where id = v_appt.id;
  else
    raise exception 'unknown decision %', v_decision;
  end if;

  insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id)
  values (v_appt.garage_id, array['garage_admin','supervisor','receptionist']::membership_role[],
          'Customer ' || v_decision || 'ed appointment',
          coalesce(v_appt.contact_name, '') || ' — ' ||
            to_char(coalesce(v_appt.proposed_at, v_appt.scheduled_at), 'Dy DD Mon, HH12:MI am'),
          'appointment', v_appt.id::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_appt.garage_id, auth.uid(), 'appointment.customer_' || v_decision,
          'appointment', v_appt.id::text, jsonb_build_object('via', 'portal'));
end $$;
grant execute on function public.portal_respond_appointment(jsonb) to authenticated;

-- ---- storage: booking photo uploads ------------------------------------
-- Path: {garage_id}/appointments/{file}. Anyone signed in may drop a photo
-- into a garage that accepts online booking; staff read it via the existing
-- "{garage_id}/..." read policy; the requesting customer reads their garage's.
drop policy if exists "booking photo insert" on storage.objects;
create policy "booking photo insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garage-media'
    and split_part(name, '/', 2) = 'appointments'
    and exists (
      select 1 from public.garages g
      where g.id = nullif(split_part(name, '/', 1), '')::uuid and g.accepts_online_booking
    )
  );

drop policy if exists "booking photo portal read" on storage.objects;
create policy "booking photo portal read" on storage.objects for select to authenticated
  using (
    bucket_id = 'garage-media'
    and split_part(name, '/', 2) = 'appointments'
    and nullif(split_part(name, '/', 1), '')::uuid in (
      select garage_id from public.customers where portal_user_id = auth.uid()
    )
  );


-- ============================ 0012_booking_photo_rls_fix.sql ============================

-- ============================================================================
-- GarageFlow — 0012 Fix booking-photo upload RLS
--
-- The 0011 "booking photo insert" storage policy did `exists (select 1 from
-- public.garages ...)` inline. Storage policies run with the caller's rights,
-- and public.garages has RLS (members only), so for a brand-new portal customer
-- that sub-select returns nothing and the upload is rejected. Move the check
-- into a SECURITY DEFINER helper.
-- ============================================================================

-- Long-standing gap: appointments.service_id never had a FK to services, so the
-- appointments page's `service:services(name)` embed always errored (PGRST200)
-- and the whole appointments list came back empty. Add the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_service_id_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_service_id_fkey
      foreign key (service_id) references public.services(id) on delete set null;
  end if;
end $$;

create or replace function public.garage_accepts_online_booking(p_garage uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.garages
    where id = p_garage and accepts_online_booking and status <> 'cancelled'
  );
$$;
grant execute on function public.garage_accepts_online_booking(uuid) to anon, authenticated;

drop policy if exists "booking photo insert" on storage.objects;
create policy "booking photo insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garage-media'
    and split_part(name, '/', 2) = 'appointments'
    and public.garage_accepts_online_booking(nullif(split_part(name, '/', 1), '')::uuid)
  );
