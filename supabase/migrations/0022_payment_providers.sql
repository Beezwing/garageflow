-- ============================================================================
-- GarageFlow — 0022 payment providers (DimePay)
-- ============================================================================
-- One row per garage per provider. `credentials` holds whatever that
-- provider needs (DimePay: client_key + signing_secret) — only the garage's
-- own admin/supervisor can read or write it; nobody else, no service-role
-- bypass needed since payment-sending code runs server-side with the admin
-- client anyway. Designed to hold a second provider later without a new
-- migration — just another `provider` value.

create table if not exists public.garage_payment_providers (
  id           uuid primary key default gen_random_uuid(),
  garage_id    uuid not null references public.garages(id) on delete cascade,
  provider     text not null,                       -- 'dimepay' (more later)
  enabled      boolean not null default true,
  sandbox      boolean not null default true,
  credentials  jsonb not null default '{}'::jsonb,   -- provider-specific secrets
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (garage_id, provider)
);
create index if not exists idx_pay_providers_garage on public.garage_payment_providers(garage_id);

alter table public.garage_payment_providers enable row level security;

drop policy if exists pay_providers_admin on public.garage_payment_providers;
create policy pay_providers_admin on public.garage_payment_providers for all to authenticated
  using (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]))
  with check (public.has_garage_role(garage_id, array['garage_admin','supervisor']::membership_role[]));

drop trigger if exists trg_pay_providers_updated on public.garage_payment_providers;
create trigger trg_pay_providers_updated before update on public.garage_payment_providers
  for each row execute function public.set_updated_at();

-- One row per attempted DimePay checkout, so the webhook (which may not echo
-- back much) can always find its way to the right invoice, and so a stale
-- webhook can't be replayed against the wrong invoice.
create table if not exists public.dimepay_checkouts (
  id           uuid primary key default gen_random_uuid(),
  garage_id    uuid not null references public.garages(id) on delete cascade,
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  amount       numeric(12,2) not null,
  currency     text not null default 'JMD',
  status       text not null default 'pending',   -- pending | paid | failed | expired
  order_url    text,
  raw_webhook  jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_dimepay_checkouts_invoice on public.dimepay_checkouts(invoice_id);

alter table public.dimepay_checkouts enable row level security;

drop policy if exists dimepay_checkouts_staff on public.dimepay_checkouts;
create policy dimepay_checkouts_staff on public.dimepay_checkouts for select to authenticated
  using (public.is_garage_member(garage_id));

drop trigger if exists trg_dimepay_checkouts_updated on public.dimepay_checkouts;
create trigger trg_dimepay_checkouts_updated before update on public.dimepay_checkouts
  for each row execute function public.set_updated_at();
