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
