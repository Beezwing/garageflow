-- ============================================================================
-- GarageFlow — 0013 Safety tips
--
-- Generic workshop safety reminders. Rows with garage_id IS NULL are the
-- platform-provided library (visible to everyone); each garage can add its own.
-- Technicians get a dismissible popup of the current tips when they open a job.
-- ============================================================================

create table if not exists public.safety_tips (
  id          uuid primary key default gen_random_uuid(),
  garage_id   uuid references public.garages(id) on delete cascade,  -- null = global library
  title       text not null,
  body        text not null,
  category    text,                                   -- PPE | Lifting | Electrical | Fire | Chemicals | General …
  severity    text not null default 'info',           -- info | warning | critical
  active      boolean not null default true,
  sort_order  int not null default 100,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_safety_tips_scope on public.safety_tips(garage_id) where active;
create trigger trg_safety_tips_updated before update on public.safety_tips
  for each row execute function public.set_updated_at();

alter table public.safety_tips enable row level security;

drop policy if exists safety_read on public.safety_tips;
create policy safety_read on public.safety_tips for select to authenticated
  using (garage_id is null or public.is_garage_member(garage_id) or public.is_platform_admin());

drop policy if exists safety_write_garage on public.safety_tips;
create policy safety_write_garage on public.safety_tips for all to authenticated
  using (garage_id is not null and public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (garage_id is not null and public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

drop policy if exists safety_write_global on public.safety_tips;
create policy safety_write_global on public.safety_tips for all to authenticated
  using (garage_id is null and public.is_platform_admin())
  with check (garage_id is null and public.is_platform_admin());

-- ---- seed the global library (only if it's empty) ----------------------
insert into public.safety_tips (garage_id, title, body, category, severity, sort_order)
select null::uuid, v.title, v.body, v.category, v.severity, v.sort_order
from (values
  ('Wear your PPE',            'Safety glasses and gloves before you start. Add a face shield for grinding, ear protection near air tools, and steel-toe boots on the floor.', 'PPE',        'warning',  10),
  ('Support the vehicle',      'Never get under a car held only by a jack. Use rated axle stands on solid, level ground and chock the wheels.', 'Lifting',    'critical', 20),
  ('Check the hoist',          'Before raising or lowering a lift: nobody underneath, arms swung to the lift points, safety locks engaged.', 'Lifting',    'critical', 30),
  ('Disconnect the battery',   'Before electrical work, welding, or airbag/SRS work, disconnect the negative terminal and wait as the manual says.', 'Electrical', 'warning',  40),
  ('Hot and under pressure',   'Let the engine and exhaust cool before you open the cooling system. Coolant, oil and steam cause serious burns.', 'General',    'warning',  50),
  ('Fuel and fumes',           'No flames, sparks or smoking near fuel. Work ventilated, cap open lines, and keep a working extinguisher within reach.', 'Fire',       'critical', 60),
  ('Handle chemicals safely',  'Battery acid, brake cleaner and solvents burn skin and eyes. Wear gloves, and flush any contact with water for 15 minutes.', 'Chemicals',  'warning',  70),
  ('Lift with your legs',      'Get a hand or use a jack/crane for anything heavy. Back straight, load close, no twisting.', 'Lifting',    'info',     80),
  ('Mind moving parts',        'Keep hands, hair, tools and loose clothing clear of belts, fans and shafts whenever the engine is running.', 'General',    'warning',  90),
  ('Clean as you go',          'Wipe oil and coolant spills immediately — a slick floor is a slip and a fire risk.', 'General',    'info',     100),
  ('Tyres and rims',           'Stand aside from the tread when inflating. Never re-inflate a tyre that has been run flat without inspecting it.', 'General',    'warning',  110),
  ('Ask if unsure',            'If a job feels unsafe or beyond your training, stop and ask a supervisor. A delay is cheaper than an injury.', 'General',    'info',     120)
) as v(title, body, category, severity, sort_order)
where not exists (select 1 from public.safety_tips where garage_id is null);
