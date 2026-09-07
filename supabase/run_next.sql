-- GarageFlow — run these (Phase 4 & 8 support, updated). Idempotent.

-- ==== 0008_user_prefs.sql ====

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

-- ==== 0009_customer_portal.sql (updated: auto-resume on approval) ====

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
