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
