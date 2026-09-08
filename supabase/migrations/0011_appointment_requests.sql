-- ============================================================================
-- GarageFlow — 0011 Customer self-service appointment requests
--
-- A customer creates a portal account, picks their garage from a public booking
-- link, and *requests* an appointment (preferred date/time + vehicle details +
-- photos). Staff either confirm that time or propose a different one; the
-- customer then accepts or declines the proposal.
--
-- The confirmed-appointment lifecycle still lives on appointments.status
-- (the appointment_status enum). The *request* lifecycle lives on a separate
-- text column so we never have to extend the enum inside a transaction.
-- ============================================================================

-- ---- garage: public booking ------------------------------------------------
alter table public.garages add column if not exists accepts_online_booking boolean not null default true;
alter table public.garages add column if not exists booking_slug text;

-- seed booking_slug from the existing slug where missing, keep it unique
update public.garages set booking_slug = slug::text where booking_slug is null;
create unique index if not exists idx_garages_booking_slug on public.garages(booking_slug);

-- ---- appointments: request fields -----------------------------------------
alter table public.appointments add column if not exists origin        text not null default 'staff'; -- staff | portal
alter table public.appointments add column if not exists request_state text;        -- null (staff) | pending | proposed | confirmed | declined | cancelled
alter table public.appointments add column if not exists requested_by  uuid references auth.users(id);
alter table public.appointments add column if not exists preferred_at  timestamptz; -- customer's original ask
alter table public.appointments add column if not exists proposed_at   timestamptz; -- staff counter-proposal
alter table public.appointments add column if not exists proposed_by   uuid references auth.users(id);
alter table public.appointments add column if not exists customer_note text;
alter table public.appointments add column if not exists staff_note    text;
alter table public.appointments add column if not exists photo_urls    text[] not null default '{}';
alter table public.appointments add column if not exists contact_name  text;
alter table public.appointments add column if not exists contact_phone text;

create index if not exists idx_appts_request_state on public.appointments(garage_id, request_state);
create index if not exists idx_appts_requested_by on public.appointments(requested_by);

-- ---- RLS: let a portal customer see their own requests --------------------
drop policy if exists appts_portal_read on public.appointments;
create policy appts_portal_read on public.appointments for select to authenticated
  using (
    requested_by = auth.uid()
    or customer_id in (select public.portal_customer_ids())
  );

-- ---- public booking-garage lookup ---------------------------------------
-- Exposes only the safe columns needed to render /book/<slug>.
create or replace function public.booking_garage(p_slug text)
returns table (id uuid, name text, phone text, address text, currency text, tax_label text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.phone, g.address, g.currency, g.tax_label
  from public.garages g
  where g.booking_slug = p_slug
    and g.accepts_online_booking
    and g.status <> 'cancelled'
$$;
grant execute on function public.booking_garage(text) to anon, authenticated;

-- List of garages a signed-in portal user could book with again (ones that
-- already know them) — handy for a "request another appointment" flow.
create or replace function public.my_booking_garages()
returns table (id uuid, name text, booking_slug text)
language sql stable security definer set search_path = public as $$
  select distinct g.id, g.name, g.booking_slug
  from public.garages g
  join public.customers c on c.garage_id = g.id
  where c.portal_user_id = auth.uid() and g.accepts_online_booking
$$;
grant execute on function public.my_booking_garages() to authenticated;

-- ---- RPC: customer requests an appointment ------------------------------
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
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_pref is null then raise exception 'a preferred date and time is required'; end if;

  select * into v_garage from public.garages
    where booking_slug = payload->>'booking_slug' and accepts_online_booking and status <> 'cancelled';
  if v_garage.id is null then raise exception 'garage not found or not accepting online bookings'; end if;

  select email into v_email from auth.users where id = v_uid;

  -- find-or-create the customer record inside this garage
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

  -- match an existing vehicle by plate, else create one
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
          coalesce(v_name, v_email) || ' requested ' || to_char(v_pref, 'Dy DD Mon, HH12:MI am'),
          'appointment', v_appt::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_garage.id, v_uid, 'appointment.requested', 'appointment', v_appt::text,
          jsonb_build_object('preferred_at', v_pref, 'via', 'portal'));

  return v_appt;
end $$;
grant execute on function public.portal_request_appointment(jsonb) to authenticated;

-- ---- RPC: staff confirm or propose a new time --------------------------
create or replace function public.staff_respond_appointment_request(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments%rowtype;
  v_action text := payload->>'action';                     -- confirm | propose
  v_new   timestamptz := nullif(payload->>'proposed_at','')::timestamptz;
begin
  select * into v_appt from public.appointments where id = (payload->>'appointment_id')::uuid;
  if v_appt.id is null then raise exception 'appointment not found'; end if;
  if not public.has_garage_role(v_appt.garage_id,
       array['garage_admin','supervisor','receptionist']::membership_role[]) then
    raise exception 'not authorized';
  end if;
  if v_appt.request_state not in ('pending','proposed') then
    raise exception 'this request is already %', v_appt.request_state;
  end if;

  if v_action = 'confirm' then
    update public.appointments
      set request_state = 'confirmed', status = 'confirmed',
          staff_note = coalesce(nullif(trim(payload->>'staff_note'),''), staff_note),
          updated_at = now()
      where id = v_appt.id;

  elsif v_action = 'propose' then
    if v_new is null then raise exception 'a proposed time is required'; end if;
    update public.appointments
      set request_state = 'proposed', proposed_at = v_new, proposed_by = auth.uid(),
          scheduled_at = v_new,
          staff_note = coalesce(nullif(trim(payload->>'staff_note'),''), staff_note),
          updated_at = now()
      where id = v_appt.id;
  else
    raise exception 'unknown action %', v_action;
  end if;

  -- tell the customer (queued in customer_messages; picked up by the notifier)
  insert into public.customer_messages (garage_id, customer_id, channel, template, payload, status)
  values (v_appt.garage_id, v_appt.customer_id, 'email',
          case when v_action = 'confirm' then 'appointment_confirmed' else 'appointment_reschedule' end,
          jsonb_build_object('appointment_id', v_appt.id,
                             'when', coalesce(v_new, v_appt.scheduled_at)),
          'queued');

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_appt.garage_id, auth.uid(), 'appointment.' || v_action, 'appointment', v_appt.id::text,
          jsonb_build_object('proposed_at', v_new));
end $$;
grant execute on function public.staff_respond_appointment_request(jsonb) to authenticated;

-- ---- RPC: customer accepts or declines a proposed time ----------------
create or replace function public.portal_respond_appointment(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments%rowtype;
  v_decision text := payload->>'decision';                 -- accept | decline
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

  insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id)
  values (v_appt.garage_id, array['garage_admin','supervisor','receptionist']::membership_role[],
          'Customer ' || v_decision || 'ed appointment',
          coalesce(v_appt.contact_name, '') || ' — ' ||
            to_char(coalesce(v_appt.proposed_at, v_appt.scheduled_at), 'Dy DD Mon, HH12:MI am'),
          'appointment', v_appt.id::text);

  insert into public.audit_logs (garage_id, user_id, action, entity_type, entity_id, after)
  values (v_appt.garage_id, auth.uid(), 'appointment.customer_' || v_decision,
          'appointment', v_appt.id::text, jsonb_build_object('via', 'portal'));
end $$;
grant execute on function public.portal_respond_appointment(jsonb) to authenticated;

-- ---- storage: booking photo uploads ------------------------------------
-- Path: {garage_id}/appointments/{file}. Anyone signed in may drop a photo
-- into a garage that accepts online booking; staff read it via the existing
-- "{garage_id}/..." read policy; the requesting customer reads their garage's.
drop policy if exists "booking photo insert" on storage.objects;
create policy "booking photo insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garage-media'
    and split_part(name, '/', 2) = 'appointments'
    and exists (
      select 1 from public.garages g
      where g.id = nullif(split_part(name, '/', 1), '')::uuid and g.accepts_online_booking
    )
  );

drop policy if exists "booking photo portal read" on storage.objects;
create policy "booking photo portal read" on storage.objects for select to authenticated
  using (
    bucket_id = 'garage-media'
    and split_part(name, '/', 2) = 'appointments'
    and nullif(split_part(name, '/', 1), '')::uuid in (
      select garage_id from public.customers where portal_user_id = auth.uid()
    )
  );
