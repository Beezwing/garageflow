# GarageFlow

A multi-tenant SaaS that replaces a garage's paper job cards, inspection sheets,
technician worksheets, invoices, payment records and vehicle checkout forms.

> **GarageFlow** is a working development name. Product name, logo, colours and
> currency are configurable per garage.

## Stack

| Layer      | Choice |
|------------|--------|
| Framework  | Next.js 16 (App Router, TypeScript, `src/`) |
| Styling    | Tailwind CSS v4, hand-rolled component kit (`src/components/ui`) |
| Database   | Supabase Postgres with Row Level Security |
| Auth       | Supabase Auth (email + password, verification, reset) |
| Storage    | Supabase Storage (`garage-media` bucket, path-scoped by garage) |
| Hosting    | Vercel + Supabase Cloud |

Tenant isolation is enforced in the database (RLS policies + `SECURITY DEFINER`
helper functions + guarded RPCs), never only in the UI.

## Getting started

1. **Create a Supabase project** — https://supabase.com/dashboard
2. **Run the SQL** in the Supabase SQL editor, in order:
   - `supabase/migrations/0001_foundation.sql`
   - `supabase/migrations/0002_vehicles_workorders.sql`
   - `supabase/migrations/0003_workshop.sql`
   - `supabase/migrations/0004_approvals_notifications.sql`
   - `supabase/migrations/0005_inventory.sql`
   - `supabase/migrations/0006_billing_quality_checkout.sql`
   - `supabase/migrations/0007_storage_and_views.sql`
   - `supabase/seed.sql` *(optional — 3 demo garages, full staff/customers/jobs)*
3. **Environment** — copy `.env.local.example` to `.env.local` and fill in the
   values from Project Settings → API.
4. **Auth URLs** — in Supabase → Authentication → URL Configuration add
   `http://localhost:3000/auth/callback` (and your production URL later).
5. `npm install && npm run dev` → http://localhost:3000

If `.env.local` is missing keys the app routes everything to `/setup` with
instructions.

### Demo logins

After running `seed.sql`, every demo user's password is `GarageFlow123!`.

| Role | Email |
|------|-------|
| Platform super admin | `super@garageflow.test` |
| Garage admin (Kingston Auto Care) | `admin@kingstonauto.test` |
| Supervisor | `super.kac@kingstonauto.test` |
| Service advisor | `front.kac@kingstonauto.test` |
| Technician | `tech1.kac@kingstonauto.test` |

Other demo garages: `admin@portmoremotors.test`, `admin@mobayspeed.test`.

## Roles

`garage_admin`, `supervisor`, `technician`, `receptionist` (per garage) plus a
platform `super_admin`. The capability matrix lives in `src/lib/permissions.ts`
and mirrors the database policies for fast UI checks.

## Project layout

```
src/
  app/
    (auth)/            login, signup, reset-password
    (app)/             the garage application (sidebar shell)
    (platform)/admin/  platform super-admin
    onboarding/        create a garage
    join/[token]/      accept a staff invitation
    setup/             shown until Supabase env is configured
    auth/              callback + sign-out route handlers
  components/ui/        design system primitives
  components/shell/     app navigation shell
  lib/
    supabase/          server / browser / middleware / admin clients
    auth.ts            session + garage context resolution
    permissions.ts     role → capability matrix
    status.ts          work order status machine
    actions/           server actions (garage, settings, staff, platform)
supabase/
  migrations/          schema (0001–0007)
  seed.sql             demo data
```

## Build phases

1. **Foundation** *(done)* — auth, multi-tenancy, roles, garage onboarding,
   settings, dashboard, audit log, platform admin, staff invitations.
2. Vehicles — customers, vehicles, check-in wizard, inspection + damage diagram,
   photos, acknowledgement, work orders.
3. Workshop — technicians, multi-tech assignment, tasks, time tracking, technician
   dashboard, service catalogue.
4. Approvals — additional work, customer approvals, overrides, customer portal,
   notifications.
5. Inventory — parts, suppliers, stock, transactions, low-stock alerts.
6. Billing — invoices, payments, receipts, quality control, checkout.
7. Reporting — financial / operational / technician / customer reports, exports.
8. SaaS — subscription plans, feature limits, platform administration.

The database schema for all phases already ships in `supabase/migrations`; the UI
is built phase by phase.
