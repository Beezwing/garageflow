# GarageFlow — Architecture & Roadmap

Working name: **GarageFlow**. Branding (name, logo, colors, currency) kept configurable per garage.

## Stack
- **Next.js 15** (App Router, TypeScript, `src/` dir, Tailwind CSS)
- **Supabase**: Postgres + Row Level Security (tenant isolation), Auth (email/password + verification + reset), Storage (photos, signatures, logos)
- **UI**: hand-rolled component library on Tailwind (Button, Card, Table, Badge, Modal, Tabs, Toast, Input, Select, EmptyState, Skeleton). Mobile-first.
- **Forms**: react-hook-form + zod (shared schemas in `src/lib/validation`)
- **Charts**: Recharts
- **PDF**: `@react-pdf/renderer` (server route handlers)
- **Deploy**: Vercel + Supabase cloud

## Layers (folder structure)
```
src/
  app/                     # routes
    (auth)/                # login, signup, verify, reset
    (platform)/admin/      # platform super admin
    (app)/                 # garage app shell (dashboard, workshop, ...)
    (portal)/portal/       # customer portal
    api/                   # route handlers (pdf, webhooks, cron)
  components/ui/           # design system primitives
  components/*             # feature components
  lib/
    supabase/              # server + browser + admin clients
    auth/                  # session, role helpers
    db/                    # typed query helpers per entity
    validation/            # zod schemas
    permissions.ts         # role -> capability matrix
    status.ts              # work order status machine
    format.ts              # currency, dates
    audit.ts               # writeAuditLog()
    notifications/         # provider abstraction (email/sms/whatsapp) + mock
  types/                   # generated supabase types + domain types
supabase/
  migrations/              # SQL
  seed.sql                 # demo data (3 garages)
```

## Multi-tenancy
- `garages` = tenants. Every tenant table has `garage_id uuid not null`.
- `memberships(user_id, garage_id, role, status)` — user may belong to many garages.
- `profiles(id->auth.users, platform_role)` — `super_admin` or null.
- RLS on **every** table. SECURITY DEFINER helpers avoid policy recursion:
  - `user_garage_ids()` → setof uuid
  - `has_role(garage uuid, roles text[])` → boolean
  - `is_platform_admin()` → boolean
- Storage: bucket `garage-media`, object path `{garage_id}/{entity}/{file}`; storage RLS checks first folder = a garage the user belongs to.
- All writes go through Server Actions / route handlers that re-check permissions server-side (never trust client).

## Roles → capabilities (src/lib/permissions.ts)
`garage_admin` (all), `supervisor`, `technician`, `receptionist`, plus platform `super_admin`.
Technician cannot approve own additional work. Receptionist has no admin/settings/pricing.

## Work Order status machine (src/lib/status.ts)
CHECKED_IN → AWAITING_INSPECTION → INSPECTED → ASSIGNMENT_PENDING → ASSIGNED → IN_PROGRESS
→ (AWAITING_PARTS | AWAITING_CUSTOMER_APPROVAL) → REPAIR_COMPLETED → QUALITY_CHECK
→ READY_FOR_PAYMENT → PAID → READY_FOR_PICKUP → CHECKED_OUT ; CANCELLED from most states.
Guards: no CHECKED_OUT while invoice balance > 0 unless `checkout override` (audit-logged).
No additional billable work proceeds without `customer_approvals` row or `overrides` row.

## Phases
1. **Foundation** — auth, tenancy, roles, garage onboarding, settings, dashboard shell, audit log, platform admin. ✅ target first runnable build
2. **Vehicles** — customers, vehicles (dedup by plate/VIN/engine), check-in wizard, inspection checklist + damage diagram, photos, acknowledgement + PDF, work order record
3. **Workshop** — technicians, multi-tech assignment, repair tasks + templates, time tracking, technician mobile dashboard
4. **Approvals** — additional work requests, customer approvals, admin/supervisor override, customer portal, notification center + provider abstraction
5. **Inventory** — parts, suppliers, stock transactions, low-stock alerts, part usage → work order + inventory deduction
6. **Billing** — invoices (labor/parts/services/other/discount/tax), payments (partial, multi-method), receipts, quality inspection, checkout + override, appointments
7. **Reporting** — financial / profitability / inventory / operations / technician / customer reports; CSV/PDF export; audit log viewer
8. **SaaS** — subscription plans, feature limits/flags, trials, platform administration polish

Runnable after every phase. Seed data: 3 garages, full staff + customers + vehicles + jobs + parts + invoices.
