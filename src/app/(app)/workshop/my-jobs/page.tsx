import Link from "next/link";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { duration, relativeTime } from "@/lib/format";
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_STATUS_TONE, PRIORITY_TONE, PRIORITY_LABELS } from "@/lib/status";
import { Card, CardBody, CardHeader, CardTitle, Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { TimeClock } from "@/components/workshop/TimeClock";

export const metadata = { title: "My jobs" };

export default async function MyJobsPage() {
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const uid = ctx.userId;

  const { data: assignments } = await supabase
    .from("technician_assignments")
    .select("work_order_id, scope")
    .eq("garage_id", ctx.garage.id)
    .eq("technician_id", uid);

  const woIds = [...new Set((assignments ?? []).map((a) => a.work_order_id as string))];

  if (woIds.length === 0) {
    return (
      <div data-tour="my-jobs">
        <PageHeader title="My jobs" description="Vehicles assigned to you." />
        <EmptyState title="Nothing assigned yet" description="A supervisor will assign you to jobs — they'll show up here." />
      </div>
    );
  }

  const [{ data: orders }, { data: tasks }, { data: entries }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, number, status, priority, complaint, checked_in_at, vehicle:vehicles(make, model, license_plate), customer:customers(name)")
      .in("id", woIds)
      .order("checked_in_at", { ascending: false }),
    supabase.from("work_order_tasks").select("id, work_order_id, title, status").eq("assigned_to", uid).in("work_order_id", woIds),
    supabase.from("time_entries").select("work_order_id, started_at, ended_at, duration_seconds").eq("technician_id", uid).in("work_order_id", woIds),
  ]);

  const tasksByWO = new Map<string, { id: string; title: string; status: string }[]>();
  (tasks ?? []).forEach((t) => {
    const arr = tasksByWO.get(t.work_order_id as string) ?? [];
    arr.push({ id: t.id as string, title: t.title as string, status: t.status as string });
    tasksByWO.set(t.work_order_id as string, arr);
  });

  const timeByWO = new Map<string, number>();
  let openEntry: { work_order_id: string; started_at: string } | null = null;
  (entries ?? []).forEach((e) => {
    timeByWO.set(
      e.work_order_id as string,
      (timeByWO.get(e.work_order_id as string) ?? 0) + Number(e.duration_seconds ?? 0),
    );
    if (!e.ended_at) openEntry = { work_order_id: e.work_order_id as string, started_at: e.started_at as string };
  });

  const active = (orders ?? []).filter((o) => !["checked_out", "cancelled", "ready_for_pickup", "paid"].includes(o.status as string));
  const done = (orders ?? []).filter((o) => ["checked_out", "cancelled", "ready_for_pickup", "paid"].includes(o.status as string));
  const numberById = new Map((orders ?? []).map((o) => [o.id as string, o.number as string]));

  function card(o: Record<string, unknown>) {
    const v = o.vehicle as { make: string; model: string; license_plate: string } | null;
    const c = o.customer as { name: string } | null;
    const wid = o.id as string;
    const wtasks = tasksByWO.get(wid) ?? [];
    const runningHere = openEntry && (openEntry as { work_order_id: string }).work_order_id === wid;
    const openWONumber =
      openEntry && !runningHere ? numberById.get((openEntry as { work_order_id: string }).work_order_id) ?? null : null;

    return (
      <Card key={wid}>
        <CardBody className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link href={`/workshop/jobs/${wid}`} className="font-semibold text-brand hover:underline">
                {o.number as string}
              </Link>
              <p className="text-sm text-text">
                {v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : ""} {v?.license_plate ? `· ${v.license_plate}` : ""}
              </p>
              <p className="text-xs text-text-muted">
                {c?.name} · in {relativeTime(o.checked_in_at as string)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge tone={WORK_ORDER_STATUS_TONE[o.status as keyof typeof WORK_ORDER_STATUS_TONE]}>
                {WORK_ORDER_STATUS_LABELS[o.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
              </Badge>
              <Badge tone={PRIORITY_TONE[o.priority as keyof typeof PRIORITY_TONE]}>
                {PRIORITY_LABELS[o.priority as keyof typeof PRIORITY_LABELS]}
              </Badge>
            </div>
          </div>

          {o.complaint ? <p className="text-sm text-text-muted">{o.complaint as string}</p> : null}

          {wtasks.length ? (
            <ul className="space-y-1 text-sm">
              {wtasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      t.status === "completed"
                        ? "bg-[var(--tone-green-fg)]"
                        : t.status === "in_progress"
                          ? "bg-[var(--tone-violet-fg)]"
                          : "bg-border"
                    }`}
                  />
                  <span className={t.status === "completed" ? "text-text-muted line-through" : "text-text"}>{t.title}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="border-t border-border pt-3">
            <TimeClock
              workOrderId={wid}
              runningSince={runningHere ? (openEntry as { started_at: string }).started_at : null}
              runningElsewhere={openWONumber}
              totalSeconds={timeByWO.get(wid) ?? 0}
            />
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div data-tour="my-jobs">
      <PageHeader title="My jobs" description={`${active.length} active · ${done.length} recently closed`} />
      {openEntry ? (
        <div className="mb-4 rounded-[var(--radius)] bg-[var(--tone-violet-bg)] px-3 py-2 text-sm text-[var(--tone-violet-fg)]">
          You&apos;re clocked in on {numberById.get((openEntry as { work_order_id: string }).work_order_id)} —{" "}
          {duration(Math.floor((Date.now() - new Date((openEntry as { started_at: string }).started_at).getTime()) / 1000))} so far.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">{active.map(card)}</div>

      {done.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recently closed</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1 text-sm">
            {done.map((o) => (
              <Link
                key={o.id as string}
                href={`/workshop/jobs/${o.id}`}
                className="flex justify-between rounded px-2 py-1.5 hover:bg-surface-2"
              >
                <span className="text-brand">{o.number as string}</span>
                <span className="text-text-muted">{duration(timeByWO.get(o.id as string) ?? 0)}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
