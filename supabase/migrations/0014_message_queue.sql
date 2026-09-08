-- ============================================================================
-- GarageFlow — 0014 Outbound message queue
--
-- customer_messages rows are written both from the app (notifyCustomer) and
-- straight from SQL (appointment confirm / reschedule RPCs). A drainer
-- (/api/cron/send-messages, plus an opportunistic drain on dashboard load)
-- picks up 'queued' rows and retries 'failed' ones a few times.
-- ============================================================================

alter table public.customer_messages add column if not exists attempts int not null default 0;
alter table public.customer_messages add column if not exists last_attempt_at timestamptz;

create index if not exists idx_customer_messages_pending
  on public.customer_messages (created_at)
  where status in ('queued', 'failed');

-- ---- invitation preview -------------------------------------------------
-- Lets the /join page show which email an invite is for (and whether it's
-- still valid) before the user tries to accept it.
create or replace function public.invitation_preview(p_token text)
returns table (email text, role text, garage_name text, expired boolean, accepted boolean)
language sql stable security definer set search_path = public as $$
  select i.email::text, i.role::text, g.name,
         (i.expires_at < now()) as expired,
         (i.accepted_at is not null) as accepted
  from public.invitations i
  join public.garages g on g.id = i.garage_id
  where i.token = p_token
$$;
grant execute on function public.invitation_preview(text) to anon, authenticated;
