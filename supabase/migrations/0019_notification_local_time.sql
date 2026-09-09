-- ============================================================================
-- GarageFlow — 0019 Notification bodies in the garage's local time
--
-- portal_request_appointment / portal_respond_appointment build the staff
-- notification body with to_char(<timestamptz>, '… HH12:MI am'), which renders
-- in the DB session zone (UTC on Supabase) — so a 10:30 am request showed as
-- "03:30 pm". Format against the garage's timezone instead.
-- ============================================================================

create or replace function public.portal_request_appointment(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_garage   public.garages%rowtype;
  v_email    text;
  v_uid      uuid := auth.uid();
  v_customer uuid;
  v_vehicle  uuid;
  v_appt     uuid;
  v_pref     timestamptz := nullif(payload->>'preferred_at','')::timestamptz;
  v_name     text := nullif(trim(payload->>'contact_name'),'');
  v_phone    text := nullif(trim(payload->>'contact_phone'),'');
  v_plate    text := nullif(trim(payload->>'license_plate'),'');
  v_tz       text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_pref is null then raise exception 'a preferred date and time is required'; end if;

  select * into v_garage from public.garages
    where booking_slug = payload->>'booking_slug' and accepts_online_booking and status <> 'cancelled';
  if v_garage.id is null then raise exception 'garage not found or not accepting online bookings'; end if;
  v_tz := coalesce(v_garage.timezone, 'America/Jamaica');

  select email into v_email from auth.users where id = v_uid;

  select id into v_customer from public.customers
    where garage_id = v_garage.id and lower(email) = lower(v_email) and deleted_at is null
    order by created_at limit 1;

  if v_customer is null then
    insert into public.customers (garage_id, name, phone, email, portal_user_id, created_by)
    values (v_garage.id, coalesce(v_name, v_email), v_phone, v_email, v_uid, v_uid)
    returning id into v_customer;
  else
    update public.customers
      set portal_user_id = coalesce(portal_user_id, v_uid),
          phone = coalesce(phone, v_phone)
      where id = v_customer;
  end if;

  if v_plate is not null then
    select id into v_vehicle from public.vehicles
      where customer_id = v_customer and upper(replace(license_plate,' ','')) = upper(replace(v_plate,' ',''))
        and deleted_at is null
      limit 1;
  end if;

  if v_vehicle is null then
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate)
    values (v_garage.id, v_customer,
            nullif(trim(payload->>'make'),''), nullif(trim(payload->>'model'),''),
            nullif(payload->>'year','')::int, v_plate)
    returning id into v_vehicle;
  end if;

  insert into public.appointments
    (garage_id, customer_id, vehicle_id, service_id, title, scheduled_at, duration_min,
     status, origin, request_state, requested_by, preferred_at, customer_note,
     photo_urls, contact_name, contact_phone)
  values
    (v_garage.id, v_customer, v_vehicle, nullif(payload->>'service_id','')::uuid,
     coalesce(nullif(trim(payload->>'title'),''), 'Repair request'),
     v_pref, coalesce((payload->>'duration_min')::int, 60),
     'scheduled', 'portal', 'pending', v_uid, v_pref,
     nullif(trim(payload->>'customer_note'),''),
     coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(payload->'photo_urls','[]'::jsonb)) x), '{}'),
     v_name, v_phone)
  returning id into v_appt;

  insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id)
  values (v_garage.id, array['garage_admin','supervisor','receptionist']::membership_role[],
          'New appointment request',
          coalesce(v_name, v_email) || ' requested ' ||
            to_char(v_pref at time zone v_tz, 'Dy DD Mon, HH12:MI am'),
          'appointment', v_appt::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_garage.id, v_uid, 'appointment.requested', 'appointment', v_appt::text,
          jsonb_build_object('preferred_at', v_pref, 'via', 'portal'));

  return v_appt;
end $$;
grant execute on function public.portal_request_appointment(jsonb) to authenticated;

create or replace function public.portal_respond_appointment(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments%rowtype;
  v_decision text := payload->>'decision';                 -- accept | decline
  v_tz text;
begin
  select * into v_appt from public.appointments where id = (payload->>'appointment_id')::uuid;
  if v_appt.id is null then raise exception 'appointment not found'; end if;
  if v_appt.requested_by <> auth.uid()
     and v_appt.customer_id not in (select public.portal_customer_ids()) then
    raise exception 'not your appointment';
  end if;
  if v_appt.request_state not in ('pending','proposed') then
    raise exception 'nothing to respond to';
  end if;

  if v_decision = 'accept' then
    update public.appointments
      set request_state = 'confirmed', status = 'confirmed',
          scheduled_at = coalesce(proposed_at, scheduled_at), updated_at = now()
      where id = v_appt.id;
  elsif v_decision = 'decline' then
    update public.appointments
      set request_state = 'declined', status = 'cancelled', updated_at = now()
      where id = v_appt.id;
  else
    raise exception 'unknown decision %', v_decision;
  end if;

  select coalesce(timezone, 'America/Jamaica') into v_tz from public.garages where id = v_appt.garage_id;

  insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id)
  values (v_appt.garage_id, array['garage_admin','supervisor','receptionist']::membership_role[],
          'Customer ' || v_decision || 'ed appointment',
          coalesce(v_appt.contact_name, '') || ' — ' ||
            to_char(coalesce(v_appt.proposed_at, v_appt.scheduled_at) at time zone v_tz, 'Dy DD Mon, HH12:MI am'),
          'appointment', v_appt.id::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_appt.garage_id, auth.uid(), 'appointment.customer_' || v_decision,
          'appointment', v_appt.id::text, jsonb_build_object('via', 'portal'));
end $$;
grant execute on function public.portal_respond_appointment(jsonb) to authenticated;
