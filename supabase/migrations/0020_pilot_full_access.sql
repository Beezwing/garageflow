-- ============================================================================
-- GarageFlow — 0020 pilot full access
-- ============================================================================
-- TEMPORARY, for the pilot phase: every new self-signup garage now gets the
-- Enterprise plan (every feature, no limits) instead of Free, so a garage
-- that signs the pilot agreements and creates their own account at /signup
-- is immediately fully unlocked — no manual plan bump needed on our side.
-- garages.trial_ends_at already defaults to now() + 30 days, matching the
-- one-month pilot promised in the NDA / Pilot Services Agreement.
--
-- BEFORE OPENING SIGNUP TO THE PUBLIC: revert the `code = 'enterprise'`
-- below back to `code = 'free'` (or whatever the real default should be),
-- otherwise every stranger who finds /signup gets a free unlimited account.

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

  select id into v_plan_id from public.subscription_plans where code = 'enterprise' limit 1;

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
