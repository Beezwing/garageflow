import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money, dateTime, shortDate, duration } from "@/lib/format";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TONE,
  PRIORITY_LABELS,
  PRIORITY_TONE,
} from "@/lib/status";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  EmptyState,
} from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import { StatusControl } from "./StatusControl";
import { AssignPanel } from "./AssignPanel";
import { TasksPanel } from "./TasksPanel";
import { ChargesPanel } from "./ChargesPanel";
import { AdditionalWorkPanel } from "./AdditionalWorkPanel";
import { QualityPanel } from "./QualityPanel";
import { InvoicePanel } from "./InvoicePanel";
import { WorkLogPanel } from "./WorkLogPanel";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const gid = ctx.garage.id;

  const { data: wo } = await supabase
    .from("work_orders")
    .select("*, customer:customers(id, name, phone), vehicle:vehicles(id, make, model, year, license_plate, vin, mileage)")
    .eq("id", id)
    .eq("garage_id", gid)
    .maybeSingle();
  if (!wo) notFound();

  const [
    { data: inspection },
    { data: assignments },
    { data: tasks },
    { data: timeEntries },
    { data: parts },
    { data: labor },
    { data: services },
    { data: awrs },
    { data: approvals },
    { data: quality },
    { data: invoices },
    { data: photos },
    { data: members },
    { data: catalogue },
    { data: stockParts },
    { data: templates },
    { data: workNotes },
  ] = await Promise.all([
    supabase.from("inspections").select("*, damages:inspection_damages(*)").eq("work_order_id", id).eq("kind", "checkin").maybeSingle(),
    supabase.from("technician_assignments").select("*").eq("work_order_id", id),
    supabase.from("work_order_tasks").select("*").eq("work_order_id", id).order("sequence"),
    supabase.from("time_entries").select("*").eq("work_order_id", id),
    supabase.from("work_order_parts").select("*").eq("work_order_id", id).order("created_at"),
    supabase.from("work_order_labor").select("*").eq("work_order_id", id).order("created_at"),
    supabase.from("work_order_services").select("*").eq("work_order_id", id).order("created_at"),
    supabase.from("additional_work_requests").select("*").eq("work_order_id", id).order("created_at"),
    supabase.from("customer_approvals").select("*").eq("garage_id", gid),
    supabase.from("quality_inspections").select("*").eq("work_order_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, number, status, total, balance").eq("work_order_id", id),
    supabase.from("vehicle_photos").select("*").eq("work_order_id", id).order("created_at"),
    supabase.from("memberships").select("user_id, role").eq("garage_id", gid).eq("status", "active"),
    supabase.from("services").select("id, name, default_price").eq("garage_id", gid).eq("active", true).order("name"),
    supabase.from("parts").select("id, name, part_number, price, quantity").eq("garage_id", gid).is("deleted_at", null).order("name"),
    supabase.from("checklist_templates").select("id, name, kind, items").eq("garage_id", gid).in("kind", ["repair", "quality"]),
    supabase.from("work_order_notes").select("*").eq("work_order_id", id).order("created_at"),
  ]);

  const qualityChecks = (templates ?? []).find((t) => t.kind === "quality")?.items as string[] | undefined;

  const memberIds = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || "—"]));
  const technicians = (members ?? [])
    .filter((m) => ["technician", "supervisor", "garage_admin"].includes(m.role as string))
    .map((m) => ({ id: m.user_id as string, name: nameById.get(m.user_id as string) ?? "—", role: m.role as string }));

  const myAssignment = (assignments ?? []).find((a) => a.technician_id === ctx.userId);
  const iAmAssigned = Boolean(myAssignment);
  const iMarkedDone = Boolean(myAssignment?.completed_at);

  const c = wo.customer as unknown as { id: string; name: string; phone: string | null } | null;
  const v = wo.vehicle as unknown as {
    id: string;
    make: string;
    model: string;
    year: number;
    license_plate: string;
    vin: string;
    mileage: number;
  } | null;
  const status = wo.status as keyof typeof WORK_ORDER_STATUS_LABELS;
  const currency = ctx.garage.currency;

  const partsTotal = (parts ?? []).reduce((t, p) => t + Number(p.amount), 0);
  const laborTotal = (labor ?? []).reduce((t, l) => t + Number(l.amount), 0);
  const servicesTotal = (services ?? []).reduce((t, s) => t + Number(s.amount), 0);
  const grandTotal = partsTotal + laborTotal + servicesTotal;

  const timeByTech = new Map<string, number>();
  (timeEntries ?? []).forEach((e) => {
    const secs = e.duration_seconds
      ? Number(e.duration_seconds)
      : e.ended_at
        ? 0
        : Math.floor((Date.now() - new Date(e.started_at as string).getTime()) / 1000);
    timeByTech.set(e.technician_id as string, (timeByTech.get(e.technician_id as string) ?? 0) + secs);
  });

  return (
    <div className="space-y-6" data-tour="workorder-page">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-text">{wo.number as string}</h1>
            <Badge tone={WORK_ORDER_STATUS_TONE[status]}>{WORK_ORDER_STATUS_LABELS[status]}</Badge>
            <Badge tone={PRIORITY_TONE[wo.priority as keyof typeof PRIORITY_TONE]}>
              {PRIORITY_LABELS[wo.priority as keyof typeof PRIORITY_LABELS]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {v ? (
              <Link href={`/vehicles/${v.id}`} className="text-brand hover:underline">
                {`${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim()} · {v.license_plate}
              </Link>
            ) : null}
            {c ? (
              <>
                {" · "}
                <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
                  {c.name}
                </Link>
                {c.phone ? ` · ${c.phone}` : ""}
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-text-subtle">
            Checked in {dateTime(wo.checked_in_at as string)}
            {wo.expected_completion ? ` · due ${shortDate(wo.expected_completion as string)}` : ""}
          </p>
        </div>
        <StatusControl
          id={id}
          status={status}
          canManage={can(ctx.role, "workorder.create")}
          hasBalance={(invoices ?? []).some((i) => Number(i.balance) > 0)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Complaint / request */}
          <Card>
            <CardHeader>
              <CardTitle>Job details</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <Detail label="Customer complaint" value={wo.complaint as string} />
              <Detail label="Requested work" value={wo.requested_work as string} />
              <Detail label="Notes" value={wo.notes as string} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Mini label="Mileage in" value={wo.mileage_in ? `${Number(wo.mileage_in).toLocaleString()} km` : "—"} />
                <Mini label="Fuel in" value={wo.fuel_level_in != null ? `${wo.fuel_level_in}%` : "—"} />
                <Mini label="Mileage out" value={wo.mileage_out ? `${Number(wo.mileage_out).toLocaleString()} km` : "—"} />
                <Mini label="Fuel out" value={wo.fuel_level_out != null ? `${wo.fuel_level_out}%` : "—"} />
              </div>
            </CardBody>
          </Card>

          {/* Inspection */}
          {inspection ? (
            <Card>
              <CardHeader>
                <CardTitle>Intake inspection</CardTitle>
                <span className="text-xs text-text-subtle">{shortDate(inspection.created_at as string)}</span>
              </CardHeader>
              <CardBody className="space-y-3 text-sm">
                {((inspection.checklist as { item: string; status: string }[]) ?? []).some((x) => x.status === "attention") ? (
                  <div>
                    <p className="mb-1 font-medium text-text">Needs attention</p>
                    <ul className="list-inside list-disc text-text-muted">
                      {((inspection.checklist as { item: string; status: string }[]) ?? [])
                        .filter((x) => x.status === "attention")
                        .map((x) => (
                          <li key={x.item}>{x.item}</li>
                        ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-text-muted">Checklist clear.</p>
                )}
                {((inspection.damages as unknown as { id: string; damage_type: string; view: string; description: string }[]) ?? []).length ? (
                  <div>
                    <p className="mb-1 font-medium text-text">Existing damage recorded</p>
                    <ul className="space-y-0.5 text-text-muted">
                      {((inspection.damages as unknown as { id: string; damage_type: string; view: string; description: string }[]) ?? []).map((d) => (
                        <li key={d.id} className="capitalize">
                          {d.damage_type} ({d.view}){d.description ? ` — ${d.description}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {inspection.notes ? <p className="italic text-text-muted">{inspection.notes as string}</p> : null}
              </CardBody>
            </Card>
          ) : null}

          {/* Tasks */}
          <TasksPanel
            woId={id}
            tasks={(tasks ?? []).map((t) => ({
              id: t.id as string,
              title: t.title as string,
              status: t.status as string,
              unable_reason: t.unable_reason as string | null,
              assigned_to: t.assigned_to as string | null,
              assignee: t.assigned_to ? nameById.get(t.assigned_to as string) ?? null : null,
            }))}
            technicians={technicians}
            templates={(templates ?? []).filter((x) => x.kind === "repair").map((x) => ({ id: x.id as string, name: x.name as string }))}
            canManage={can(ctx.role, "task.manage")}
            currentUserId={ctx.userId}
          />

          {/* Work log & completion */}
          <WorkLogPanel
            woId={id}
            status={status}
            notes={(workNotes ?? []).map((n) => ({
              id: n.id as string,
              kind: n.kind as string,
              body: n.body as string,
              created_at: n.created_at as string,
              author: n.author_id ? nameById.get(n.author_id as string) ?? null : null,
            }))}
            canWrite={iAmAssigned || can(ctx.role, "task.manage")}
            canMarkDone={iAmAssigned || can(ctx.role, "task.manage")}
            alreadyDone={iMarkedDone}
          />

          {/* Charges */}
          <ChargesPanel
            woId={id}
            currency={currency}
            parts={(parts ?? []).map((p) => ({ id: p.id as string, description: p.description as string, quantity: Number(p.quantity), unit_price: Number(p.unit_price), amount: Number(p.amount) }))}
            labor={(labor ?? []).map((l) => ({ id: l.id as string, description: l.description as string, hours: Number(l.hours), rate: Number(l.rate), amount: Number(l.amount) }))}
            services={(services ?? []).map((s) => ({ id: s.id as string, description: s.description as string, quantity: Number(s.quantity), unit_price: Number(s.unit_price), amount: Number(s.amount) }))}
            catalogue={(catalogue ?? []).map((s) => ({ id: s.id as string, name: s.name as string, default_price: Number(s.default_price) }))}
            stockParts={(stockParts ?? []).map((p) => ({ id: p.id as string, name: p.name as string, part_number: p.part_number as string | null, price: Number(p.price), quantity: Number(p.quantity) }))}
            defaultRate={Number(ctx.garage.labor_rate)}
            canEdit={can(ctx.role, "price.override")}
            canUseParts={can(ctx.role, "part.useOnJob")}
          />

          {/* Additional work */}
          <AdditionalWorkPanel
            woId={id}
            garageId={gid}
            currency={currency}
            requests={(awrs ?? []).map((r) => ({
              id: r.id as string,
              problem: r.problem as string,
              recommendation: r.recommendation as string | null,
              price: Number(r.price),
              status: r.status as string,
              requested_by: r.requested_by as string | null,
              requester: r.requested_by ? nameById.get(r.requested_by as string) ?? null : null,
              approval: (approvals ?? []).find((a) => a.request_id === r.id) as
                | { decision: string; amount: number; method: string }
                | undefined,
            }))}
            currentUserId={ctx.userId}
            canRequest={can(ctx.role, "additionalWork.request")}
            canApprove={can(ctx.role, "additionalWork.recordApproval")}
            canOverride={can(ctx.role, "override.perform")}
          />

          {/* Quality */}
          {["repair_completed", "quality_check", "ready_for_payment", "paid", "ready_for_pickup", "checked_out"].includes(status) ? (
            <QualityPanel
              woId={id}
              existing={(quality ?? []).map((q) => ({
                id: q.id as string,
                passed: q.passed as boolean,
                notes: q.notes as string | null,
                created_at: q.created_at as string,
                by: q.supervisor_id ? nameById.get(q.supervisor_id as string) ?? null : null,
              }))}
              canPerform={can(ctx.role, "quality.perform")}
              checks={qualityChecks}
            />
          ) : null}

          {/* Photos */}
          {(photos ?? []).length ? (
            <Card>
              <CardHeader>
                <CardTitle>Photos ({(photos ?? []).length})</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {(photos ?? []).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={p.id as string} href={p.url as string} target="_blank" rel="noreferrer">
                      <img
                        src={p.url as string}
                        alt={(p.category as string) ?? "photo"}
                        className="aspect-square w-full rounded-[var(--radius)] border border-border object-cover"
                      />
                      <p className="mt-0.5 text-[0.65rem] text-text-subtle">
                        {(p.phase as string) === "after" ? "After · " : "Before · "}
                        {(p.category as string) ?? ""}
                      </p>
                    </a>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <AssignPanel
            woId={id}
            assignments={(assignments ?? []).map((a) => ({
              id: a.id as string,
              technician_id: a.technician_id as string,
              name: nameById.get(a.technician_id as string) ?? "—",
              scope: a.scope as string | null,
              time: duration(timeByTech.get(a.technician_id as string) ?? 0),
              done: Boolean(a.completed_at),
            }))}
            technicians={technicians}
            canManage={can(ctx.role, "workorder.assign")}
          />

          <Card>
            <CardHeader>
              <CardTitle>Charges</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5 text-sm">
              <Line k="Parts" v={money(partsTotal, currency)} />
              <Line k="Labour" v={money(laborTotal, currency)} />
              <Line k="Services" v={money(servicesTotal, currency)} />
              <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold text-text">
                <span>Subtotal</span>
                <span>{money(grandTotal, currency)}</span>
              </div>
              <p className="text-xs text-text-subtle">+ {ctx.garage.tax_label} on invoice</p>
            </CardBody>
          </Card>

          <InvoicePanel
            woId={id}
            currency={currency}
            invoices={(invoices ?? []).map((i) => ({
              id: i.id as string,
              number: i.number as string,
              status: i.status as string,
              total: Number(i.total),
              balance: Number(i.balance),
            }))}
            canManage={can(ctx.role, "invoice.manage")}
          />

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5 text-sm">
              <a href={`/print/workorder/${id}`} target="_blank" rel="noreferrer" className="block text-brand hover:underline">
                Work order sheet (PDF)
              </a>
              {(invoices ?? [])[0] ? (
                <a
                  href={`/print/invoice/${(invoices ?? [])[0].id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-brand hover:underline"
                >
                  Invoice / receipt (PDF)
                </a>
              ) : null}
              {status === "checked_out" ? (
                <a href={`/print/checkout/${id}`} target="_blank" rel="noreferrer" className="block text-brand hover:underline">
                  Vehicle release form (PDF)
                </a>
              ) : null}
            </CardBody>
          </Card>

          {(timeEntries ?? []).length ? (
            <Card>
              <CardHeader>
                <CardTitle>Time logged</CardTitle>
              </CardHeader>
              <CardBody className="space-y-1.5 text-sm">
                {[...timeByTech.entries()].map(([tid, secs]) => (
                  <Line key={tid} k={nameById.get(tid) ?? "—"} v={duration(secs)} />
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p className="whitespace-pre-wrap text-text">{value}</p>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] bg-surface-2 px-2.5 py-2">
      <p className="text-[0.65rem] uppercase tracking-wide text-text-subtle">{label}</p>
      <p className="text-sm font-medium text-text">{value}</p>
    </div>
  );
}
function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{k}</span>
      <span className="text-text">{v}</span>
    </div>
  );
}

void EmptyState;
