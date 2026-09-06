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
