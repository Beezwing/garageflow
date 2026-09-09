-- ============================================================================
-- GarageFlow — 0018 Fix staff "record customer decision" on additional work
--
-- record_customer_approval had the same bug 0015 fixed for the portal:
--   set status = CASE … END   (text)  →  additional_work_requests.status  (enum)
-- Postgres won't implicitly cast a text expression to an enum, so every staff
-- Approve/Decline of additional work failed with
--   "column status is of type approval_status but expression is of type text".
-- ============================================================================

create or replace function public.record_customer_approval(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_req public.additional_work_requests%rowtype;
  v_id uuid;
  v_decision text := payload->>'decision';
begin
  if v_decision not in ('approved', 'declined') then
    raise exception 'decision must be approved or declined';
  end if;

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
  values (v_req.garage_id, v_req.id, v_decision,
          coalesce(nullif(payload->>'amount','')::numeric, v_req.price),
          payload->>'method', payload->>'customer_signature', payload->>'notes', auth.uid())
  returning id into v_id;

  update public.additional_work_requests
    set status = v_decision::approval_status
    where id = v_req.id;

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_req.garage_id, auth.uid(), 'additional_work.' || v_decision,
          'additional_work_request', v_req.id::text,
          jsonb_build_object('amount', payload->>'amount', 'method', payload->>'method'));

  return v_id;
end $$;
grant execute on function public.record_customer_approval(jsonb) to authenticated;
