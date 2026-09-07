import Link from "next/link";
import { requirePortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { relativeTime, shortDate } from "@/lib/format";
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_STATUS_TONE } from "@/lib/status";
import { Card, CardBody, Badge, EmptyState } from "@/components/ui/primitives";

export const metadata = { title: "Your vehicles" };

const CUSTOMER_STAGE: Record<string, string> = {
  checked_in: "We've received your vehicle.",
  awaiting_inspection: "Waiting to be inspected.",
  inspected: "Inspection done — planning the work.",
  assignment_pending: "Assigning a technician.",
  assigned: "A technician is assigned.",
  in_progress: "Work is underway.",
  awaiting_parts: "Waiting on parts.",
  awaiting_customer_approval: "We need your approval to continue.",
  repair_completed: "Repairs finished — final checks next.",
  quality_check: "Final quality check.",
  ready_for_payment: "Ready — payment outstanding.",
  paid: "Paid. Getting it ready for you.",
  ready_for_pickup: "Ready for pickup!",
  checked_out: "Collected.",
  cancelled: "This job was cancelled.",
};

export default async function PortalHome() {
  const ctx = await requirePortalContext();
  const supabase = await createClient();
  const customerIds = ctx.customers.map((c) => c.id);

  const [{ data: vehicles }, { data: orders }, { data: pendingWork }] = await Promise.all([
    supabase.from("vehicles").select("id, make, model, year, license_plate").in("customer_id", customerIds),
    supabase
      .from("work_orders")
      .select("id, number, status, complaint, checked_in_at, vehicle:vehicles(make, model, license_plate)")
      .in("customer_id", customerIds)
      .order("checked_in_at", { ascending: false }),
    supabase
      .from("additional_work_requests")
      .select("id, work_order_id, problem, price, status")
      .eq("status", "pending"),
  ]);

  const active = (orders ?? []).filter((o) => !["checked_out", "cancelled"].includes(o.status as string));
  const past = (orders ?? []).filter((o) => ["checked_out", "cancelled"].includes(o.status as string));
  const myPending = (pendingWork ?? []).filter((w) =>
    (orders ?? []).some((o) => o.id === w.work_order_id),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text">Hi {ctx.fullName.split(" ")[0]} 👋</h1>

      {myPending.length > 0 ? (
        <Card className="border-[var(--tone-amber-fg)]">
          <CardBody>
            <p className="text-sm font-semibold text-[var(--tone-amber-fg)]">
              {myPending.length} item{myPending.length > 1 ? "s" : ""} need your approval
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {myPending.map((w) => {
                const o = (orders ?? []).find((x) => x.id === w.work_order_id);
                return (
                  <li key={w.id}>
                    <Link href={`/portal/jobs/${w.work_order_id}`} className="text-brand hover:underline">
                      {o?.number}: {w.problem as string}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">In progress</h2>
        {active.length === 0 ? (
          <EmptyState title="Nothing in the shop right now" />
        ) : (
          <div className="space-y-3">
            {active.map((o) => {
              const v = o.vehicle as unknown as { make: string; model: string; license_plate: string } | null;
              return (
                <Link key={o.id as string} href={`/portal/jobs/${o.id}`}>
                  <Card className="transition-colors hover:border-brand">
                    <CardBody>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-text">
                            {v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : "Vehicle"}{" "}
                            {v?.license_plate ? <span className="text-text-subtle">· {v.license_plate}</span> : null}
                          </p>
                          <p className="text-xs text-text-subtle">
                            {o.number as string} · dropped off {relativeTime(o.checked_in_at as string)}
                          </p>
                        </div>
                        <Badge tone={WORK_ORDER_STATUS_TONE[o.status as keyof typeof WORK_ORDER_STATUS_TONE]}>
                          {WORK_ORDER_STATUS_LABELS[o.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-text-muted">{CUSTOMER_STAGE[o.status as string]}</p>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Your vehicles</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(vehicles ?? []).map((v) => (
            <Card key={v.id as string}>
              <CardBody className="text-sm">
                <p className="font-medium text-text">
                  {`${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle"}
                </p>
                <p className="text-text-subtle">{(v.license_plate as string) ?? ""}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">History</h2>
          <div className="space-y-1 text-sm">
            {past.map((o) => (
              <Link
                key={o.id as string}
                href={`/portal/jobs/${o.id}`}
                className="flex justify-between rounded px-2 py-1.5 hover:bg-surface-2"
              >
                <span className="text-brand">{o.number as string}</span>
                <span className="text-text-subtle">{shortDate(o.checked_in_at as string)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
