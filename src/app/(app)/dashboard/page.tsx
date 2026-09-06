import Link from "next/link";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { money, shortDate, relativeTime } from "@/lib/format";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TONE,
  PRIORITY_TONE,
  PRIORITY_LABELS,
  OPEN_STATUSES,
} from "@/lib/status";
import { StatCard } from "@/components/ui/StatCard";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  PageHeader,
  EmptyState,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = { title: "Dashboard" };

function startOf(kind: "day" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (kind === "week") d.setDate(d.getDate() - d.getDay());
  if (kind === "month") d.setDate(1);
  return d.toISOString();
}

export default async function DashboardPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "reports.view")) redirect("/workshop/my-jobs");

  const supabase = await createClient();
  const gid = ctx.garage.id;
  const currency = ctx.garage.currency;
  const todayStart = startOf("day");

  const [
    { data: openOrders },
    { count: checkedInToday },
    { data: openInvoices },
    { data: payToday },
    { data: payWeek },
    { data: payMonth },
    { data: openTime },
    { data: recent },
  ] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, status, priority")
      .eq("garage_id", gid)
      .in("status", OPEN_STATUSES),
    supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("garage_id", gid)
      .gte("checked_in_at", todayStart),
    supabase
      .from("invoices")
      .select("balance")
      .eq("garage_id", gid)
      .in("status", ["unpaid", "partial"]),
    supabase.from("payments").select("amount, is_refund").eq("garage_id", gid).gte("created_at", startOf("day")),
    supabase.from("payments").select("amount, is_refund").eq("garage_id", gid).gte("created_at", startOf("week")),
    supabase.from("payments").select("amount, is_refund").eq("garage_id", gid).gte("created_at", startOf("month")),
    supabase.from("time_entries").select("technician_id").eq("garage_id", gid).is("ended_at", null),
    supabase
      .from("work_orders")
      .select("id, number, status, priority, complaint, checked_in_at, customer:customers(name), vehicle:vehicles(make, model, license_plate)")
      .eq("garage_id", gid)
      .order("checked_in_at", { ascending: false })
      .limit(8),
  ]);

  const sum = (rows: { amount: number; is_refund: boolean }[] | null) =>
    (rows ?? []).reduce((t, r) => t + (r.is_refund ? -Number(r.amount) : Number(r.amount)), 0);

  const byStatus = (statuses: string[]) =>
    (openOrders ?? []).filter((o) => statuses.includes(o.status)).length;

  const outstanding = (openInvoices ?? []).reduce((t, r) => t + Number(r.balance), 0);
  const techsWorking = new Set((openTime ?? []).map((t) => t.technician_id)).size;

  const workshopCards = [
    { label: "Vehicles in garage", value: (openOrders ?? []).length, href: "/workshop/jobs", tone: "blue" as const },
    { label: "Checked in today", value: checkedInToday ?? 0, tone: "gray" as const },
    { label: "Awaiting inspection", value: byStatus(["awaiting_inspection"]), href: "/workshop/jobs?status=awaiting_inspection", tone: "amber" as const },
    { label: "In progress", value: byStatus(["in_progress"]), href: "/workshop/jobs?status=in_progress", tone: "violet" as const },
    { label: "Awaiting parts", value: byStatus(["awaiting_parts"]), tone: "amber" as const },
    { label: "Awaiting approval", value: byStatus(["awaiting_customer_approval"]), tone: "amber" as const },
    { label: "Quality check", value: byStatus(["quality_check", "repair_completed"]), tone: "violet" as const },
    { label: "Ready for payment / pickup", value: byStatus(["ready_for_payment", "paid", "ready_for_pickup"]), href: "/workshop/jobs?status=ready_for_payment", tone: "green" as const },
  ];

  return (
    <div>
      <PageHeader
        title={`Good day — ${ctx.garage.name}`}
        description={`${shortDate(new Date())} · workshop overview`}
        actions={
          can(ctx.role, "vehicle.checkin") ? (
            <ButtonLink href="/workshop/check-in">Check in vehicle</ButtonLink>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {workshopCards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} href={c.href} tone={c.tone} />
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <StatCard label="Today's revenue" value={money(sum(payToday), currency)} tone="green" />
        <StatCard label="This week" value={money(sum(payWeek), currency)} tone="green" />
        <StatCard label="This month" value={money(sum(payMonth), currency)} tone="green" />
        <StatCard
          label="Outstanding invoices"
          value={money(outstanding, currency)}
          sub={`${(openInvoices ?? []).length} unpaid / partial`}
          href="/billing/invoices?status=unpaid"
          tone={outstanding > 0 ? "amber" : "gray"}
        />
        <StatCard label="Technicians working now" value={techsWorking} href="/technicians" tone="blue" />
        <StatCard label="Open jobs total" value={(openOrders ?? []).length} tone="gray" />
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <Link href="/workshop/jobs" className="text-sm text-brand hover:underline">
              All jobs
            </Link>
          </CardHeader>
          {(recent ?? []).length === 0 ? (
            <CardBody>
              <EmptyState
                title="No work orders yet"
                description="Check in a vehicle to open the first job card."
                action={
                  can(ctx.role, "vehicle.checkin") ? (
                    <ButtonLink href="/workshop/check-in">Check in vehicle</ButtonLink>
                  ) : null
                }
              />
            </CardBody>
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Job</Th>
                    <Th>Vehicle</Th>
                    <Th>Customer</Th>
                    <Th>Status</Th>
                    <Th>Priority</Th>
                    <Th>Checked in</Th>
                  </tr>
                </thead>
                <tbody>
                  {(recent ?? []).map((o) => {
                    const v = o.vehicle as unknown as { make: string; model: string; license_plate: string } | null;
                    const c = o.customer as unknown as { name: string } | null;
                    return (
                      <tr key={o.id} className="hover:bg-surface-2">
                        <Td>
                          <Link href={`/workshop/jobs/${o.id}`} className="font-medium text-brand hover:underline">
                            {o.number}
                          </Link>
                        </Td>
                        <Td>
                          {v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : "—"}
                          {v?.license_plate ? (
                            <span className="ml-1 text-text-subtle">· {v.license_plate}</span>
                          ) : null}
                        </Td>
                        <Td>{c?.name ?? "—"}</Td>
                        <Td>
                          <Badge tone={WORK_ORDER_STATUS_TONE[o.status as keyof typeof WORK_ORDER_STATUS_TONE]}>
                            {WORK_ORDER_STATUS_LABELS[o.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge tone={PRIORITY_TONE[o.priority as keyof typeof PRIORITY_TONE]}>
                            {PRIORITY_LABELS[o.priority as keyof typeof PRIORITY_LABELS]}
                          </Badge>
                        </Td>
                        <Td className="text-text-muted">{relativeTime(o.checked_in_at)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </section>
    </div>
  );
}
