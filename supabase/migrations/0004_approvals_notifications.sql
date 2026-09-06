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
