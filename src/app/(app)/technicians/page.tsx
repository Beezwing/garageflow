import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { duration, initials } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/status";
import { PageHeader, Card, CardBody, EmptyState, Badge } from "@/components/ui/primitives";

export const metadata = { title: "Technicians" };

export default async function TechniciansPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "workorder.assign")) redirect("/dashboard");

  const supabase = await createClient();
  const gid = ctx.garage.id;

  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("garage_id", gid)
    .eq("status", "active")
    .in("role", ["technician", "supervisor"]);

  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) {
    return (
      <div>
        <PageHeader title="Technicians" />
        <EmptyState title="No technicians yet" description="Invite technicians from Settings → Staff." />
      </div>
    );
  }

  const [{ data: profiles }, { data: assignments }, { data: openTime }, { data: tasks }, { data: recentTime }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", ids),
      supabase
        .from("technician_assignments")
        .select("technician_id, work_order:work_orders(status)")
        .eq("garage_id", gid)
        .in("technician_id", ids),
      supabase.from("time_entries").select("technician_id, started_at").eq("garage_id", gid).is("ended_at", null),
      supabase.from("work_order_tasks").select("assigned_to, status").eq("garage_id", gid).in("assigned_to", ids),
      supabase
        .from("time_entries")
        .select("technician_id, duration_seconds, started_at")
        .eq("garage_id", gid)
        .gte("started_at", new Date(Date.now() - 7 * 864e5).toISOString()),
    ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || "—"]));
  const roleById = new Map((members ?? []).map((m) => [m.user_id as string, m.role as string]));

  const openJobs = new Map<string, number>();
  (assignments ?? []).forEach((a) => {
    const st = (a.work_order as unknown as { status: string } | null)?.status;
    if (st && (OPEN_STATUSES as string[]).includes(st)) {
      openJobs.set(a.technician_id as string, (openJobs.get(a.technician_id as string) ?? 0) + 1);
    }
  });

  const workingNow = new Map<string, string>();
  (openTime ?? []).forEach((t) => workingNow.set(t.technician_id as string, t.started_at as string));

  const tasksOpen = new Map<string, number>();
  (tasks ?? []).forEach((t) => {
    if (t.status !== "completed") {
      tasksOpen.set(t.assigned_to as string, (tasksOpen.get(t.assigned_to as string) ?? 0) + 1);
    }
  });

  const weekTime = new Map<string, number>();
  (recentTime ?? []).forEach((t) => {
    weekTime.set(t.technician_id as string, (weekTime.get(t.technician_id as string) ?? 0) + Number(t.duration_seconds ?? 0));
  });

  const rows = ids
    .map((id) => ({
      id,
      name: nameById.get(id) ?? "—",
      role: roleById.get(id) ?? "technician",
      openJobs: openJobs.get(id) ?? 0,
      openTasks: tasksOpen.get(id) ?? 0,
      since: workingNow.get(id) ?? null,
      week: weekTime.get(id) ?? 0,
    }))
    .sort((a, b) => (b.since ? 1 : 0) - (a.since ? 1 : 0) || b.openJobs - a.openJobs);

  return (
    <div data-tour="technicians-page">
      <PageHeader
        title="Technicians"
        description={`${rows.filter((r) => r.since).length} working now · ${rows.length} total`}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                  {initials(r.name)}
                </span>
                <div>
                  <p className="font-medium text-text">{r.name}</p>
                  <p className="text-xs text-text-subtle">{ROLE_LABELS[r.role as keyof typeof ROLE_LABELS]}</p>
                </div>
              </div>
              {r.since ? (
                <Badge tone="violet">
                  Working ·{" "}
                  {duration(Math.floor((Date.now() - new Date(r.since).getTime()) / 1000))}
                </Badge>
              ) : (
                <Badge tone="gray">Available</Badge>
              )}
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Open jobs" value={r.openJobs} />
                <Stat label="Open tasks" value={r.openTasks} />
                <Stat label="This week" value={duration(r.week)} />
              </dl>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius)] bg-surface-2 px-2 py-2">
      <p className="text-sm font-semibold text-text">{value}</p>
      <p className="text-[0.65rem] uppercase tracking-wide text-text-subtle">{label}</p>
    </div>
  );
}
