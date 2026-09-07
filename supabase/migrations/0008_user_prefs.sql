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
