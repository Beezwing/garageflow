-- ============================================================================
-- GarageFlow — 0012 Fix booking-photo upload RLS
--
-- The 0011 "booking photo insert" storage policy did `exists (select 1 from
-- public.garages ...)` inline. Storage policies run with the caller's rights,
-- and public.garages has RLS (members only), so for a brand-new portal customer
-- that sub-select returns nothing and the upload is rejected. Move the check
-- into a SECURITY DEFINER helper.
-- ============================================================================

-- Long-standing gap: appointments.service_id never had a FK to services, so the
-- appointments page's `service:services(name)` embed always errored (PGRST200)
-- and the whole appointments list came back empty. Add the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_service_id_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_service_id_fkey
      foreign key (service_id) references public.services(id) on delete set null;
  end if;
end $$;

create or replace function public.garage_accepts_online_booking(p_garage uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.garages
    where id = p_garage and accepts_online_booking and status <> 'cancelled'
  );
$$;
grant execute on function public.garage_accepts_online_booking(uuid) to anon, authenticated;

drop policy if exists "booking photo insert" on storage.objects;
create policy "booking photo insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'garage-media'
    and split_part(name, '/', 2) = 'appointments'
    and public.garage_accepts_online_booking(nullif(split_part(name, '/', 1), '')::uuid)
  );
