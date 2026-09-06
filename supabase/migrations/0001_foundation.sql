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
