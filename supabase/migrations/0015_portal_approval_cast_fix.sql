-- ============================================================================
-- GarageFlow — 0015 Fix portal additional-work approval
--
-- portal_respond_additional_work did `set status = case … end`, where the CASE
-- returns text and additional_work_requests.status is the approval_status enum.
-- Postgres won't implicitly cast a text expression to an enum, so every
-- customer Approve/Decline from the portal failed with
--   "column status is of type approval_status but expression is of type text".
-- The decision value ("approved" / "declined") is already a valid enum member —
-- cast it directly.
-- ============================================================================

create or replace function public.portal_respond_additional_work(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_req public.additional_work_requests%rowtype;
  v_id uuid;
  v_decision text := payload->>'decision';
begin
  if v_decision not in ('approved', 'declined') then
    raise exception 'decision must be approved or declined';
  end if;

  select * into v_req from public.additional_work_requests where id = (payload->>'request_id')::uuid;
  if v_req.id is null then raise exception 'request not found'; end if;
  if not public.portal_owns_work_order(v_req.work_order_id) then
    raise exception 'not your vehicle';
  end if;
  if v_req.status <> 'pending' then raise exception 'already decided'; end if;

  insert into public.customer_approvals (garage_id, request_id, decision, amount, method, customer_signature, notes, recorded_by)
  values (v_req.garage_id, v_req.id, v_decision, v_req.price, 'portal',
          payload->>'customer_signature', payload->>'notes', auth.uid())
  returning id into v_id;

  update public.additional_work_requests
    set status = v_decision::approval_status
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
          'Customer ' || v_decision || ' additional work',
          v_req.problem, 'work_order', v_req.work_order_id::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_req.garage_id, auth.uid(), 'additional_work.portal_' || v_decision,
          'additional_work_request', v_req.id::text, jsonb_build_object('via', 'portal'));

  return v_id;
end $$;
grant execute on function public.portal_respond_additional_work(jsonb) to authenticated;
