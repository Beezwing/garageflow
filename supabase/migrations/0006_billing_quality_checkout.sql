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
