import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime, shortDate } from "@/lib/format";
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_STATUS_TONE } from "@/lib/status";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { ApprovalCard } from "./ApprovalCard";

const STEPS: { key: string; label: string }[] = [
  { key: "checked_in", label: "Received" },
  { key: "inspected", label: "Inspected" },
  { key: "in_progress", label: "In repair" },
  { key: "quality_check", label: "Quality check" },
  { key: "ready_for_pickup", label: "Ready" },
  { key: "checked_out", label: "Collected" },
];
const ORDER = [
  "checked_in",
  "awaiting_inspection",
  "inspected",
  "assignment_pending",
  "assigned",
  "in_progress",
  "awaiting_parts",
  "awaiting_customer_approval",
  "repair_completed",
  "quality_check",
  "ready_for_payment",
  "paid",
  "ready_for_pickup",
  "checked_out",
];

export default async function PortalJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortalContext();
  const supabase = await createClient();
  const customerIds = ctx.customers.map((c) => c.id);

  const { data: wo } = await supabase
    .from("work_orders")
    .select("*, vehicle:vehicles(make, model, year, license_plate)")
    .eq("id", id)
    .in("customer_id", customerIds)
    .maybeSingle();
  if (!wo) notFound();

  const [{ data: tasks }, { data: awrs }, { data: approvals }, { data: invoices }, { data: photos }] = await Promise.all([
    supabase.from("work_order_tasks").select("title, status").eq("work_order_id", id).order("sequence"),
    supabase.from("additional_work_requests").select("*").eq("work_order_id", id).order("created_at"),
    supabase.from("customer_approvals").select("request_id, decision, decided_at"),
    supabase.from("invoices").select("id, number, status, total, balance").eq("work_order_id", id),
    supabase.from("vehicle_photos").select("id, url, category, phase").eq("work_order_id", id).order("created_at"),
  ]);

  const v = wo.vehicle as unknown as { make: string; model: string; year: number; license_plate: string } | null;
  const status = wo.status as keyof typeof WORK_ORDER_STATUS_LABELS;
  const currentIdx = ORDER.indexOf(status as string);
  const garage = ctx.customers.find((c) => c.garage_id === wo.garage_id)?.garage;
  const cur = garage?.currency ?? "JMD";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal" className="text-sm text-brand hover:underline">
          ← All vehicles
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text">
            {v ? `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() : "Vehicle"}
          </h1>
          <Badge tone={WORK_ORDER_STATUS_TONE[status]}>{WORK_ORDER_STATUS_LABELS[status]}</Badge>
        </div>
        <p className="text-xs text-text-subtle">
          {wo.number as string} · {v?.license_plate} · dropped off {dateTime(wo.checked_in_at as string)}
        </p>
      </div>

      {/* progress */}
      <Card>
        <CardBody>
          <ol className="flex justify-between">
            {STEPS.map((s) => {
              const idx = ORDER.indexOf(s.key);
              const done = currentIdx >= idx && status !== "cancelled";
              return (
                <li key={s.key} className="flex flex-1 flex-col items-center text-center">
                  <span
                    className={`h-3 w-3 rounded-full ${done ? "bg-brand" : "bg-border"}`}
                  />
                  <span className={`mt-1 text-[0.65rem] ${done ? "text-text" : "text-text-subtle"}`}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      {(awrs ?? []).map((r) => (
        <ApprovalCard
          key={r.id as string}
          workOrderId={id}
          request={{
            id: r.id as string,
            problem: r.problem as string,
            recommendation: r.recommendation as string | null,
            price: Number(r.price),
            status: r.status as string,
          }}
          decidedAt={
            ((approvals ?? []).find((a) => a.request_id === r.id)?.decided_at as string) ?? null
          }
          currency={cur}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>What we&apos;re doing</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          {wo.complaint ? (
            <p>
              <span className="text-text-subtle">You reported:</span> {wo.complaint as string}
            </p>
          ) : null}
          {(tasks ?? []).length ? (
            <ul className="space-y-1">
              {(tasks ?? []).map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      t.status === "completed" ? "bg-[var(--tone-green-fg)]" : "bg-border"
                    }`}
                  />
                  <span className={t.status === "completed" ? "text-text-muted line-through" : "text-text"}>
                    {t.title as string}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">Work plan is being prepared.</p>
          )}
        </CardBody>
      </Card>

      {(invoices ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Invoice</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {(invoices ?? []).map((inv) => (
              <Link
                key={inv.id as string}
                href={`/portal/invoices/${inv.id}`}
                className="flex items-center justify-between rounded bg-surface-2 px-3 py-2 hover:bg-border"
              >
                <span className="font-medium text-brand">{inv.number as string}</span>
                <span>
                  {money(Number(inv.total), cur)}{" "}
                  <Badge tone={Number(inv.balance) > 0 ? "amber" : "green"}>
                    {Number(inv.balance) > 0 ? `${money(Number(inv.balance), cur)} due` : "paid"}
                  </Badge>
                </span>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {(photos ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-3 gap-2">
              {(photos ?? []).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={p.id as string} href={p.url as string} target="_blank" rel="noreferrer">
                  <img
                    src={p.url as string}
                    alt={(p.category as string) ?? "photo"}
                    className="aspect-square w-full rounded-[var(--radius)] border border-border object-cover"
                  />
                </a>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {wo.status === "checked_out" ? (
        <p className="text-center text-sm text-text-muted">
          Collected {wo.checked_out_at ? shortDate(wo.checked_out_at as string) : ""}. Thanks!
        </p>
      ) : null}
    </div>
  );
}
