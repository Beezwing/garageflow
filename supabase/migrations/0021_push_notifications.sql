-- ============================================================================
-- GarageFlow — 0021 push notifications
-- ============================================================================
-- Web Push subscriptions, one row per device/browser a user has enabled
-- notifications on. Works for staff and portal customers alike — this is
-- just "which user has which subscribed device", not garage-scoped.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Marks when a staff `notifications` row was last processed for push delivery
-- (role-broadcast rows fan out to every matching member, so this just tracks
-- "have we tried push for this row" rather than per-recipient delivery).
alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists idx_notif_unpushed on public.notifications(created_at) where pushed_at is null;
