import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, shortDate, dateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { StatCard } from "@/components/ui/StatCard";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { setGaragePlan, setGarageStatus } from "@/lib/actions/platform";

export default async function AdminGaragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) notFound();

  // platform-admin RLS policies (`or public.is_platform_admin()`) allow this read
  const supabase = await createClient();

  const { data: garage } = await supabase
    .from("garages")
    .select("*, plan:subscription_plans(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!garage) notFound();

  const [
    { data: plans },
    { data: members },
    { count: customers },
    { count: vehicles },
    { count: workOrders },
    { data: payments },
    { data: recentAudit },
  ] = await Promise.all([
    supabase.from("subscription_plans").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("memberships").select("role, user_id, status").eq("garage_id", id),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("garage_id", id).is("deleted_at", null),
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("garage_id", id).is("deleted_at", null),
    supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("garage_id", id),
    supabase.from("payments").select("amount, is_refund").eq("garage_id", id),
    supabase.from("audit_logs").select("action, actor_name, created_at").eq("garage_id", id).order("created_at", { ascending: false }).limit(15),
  ]);

  const revenue = (payments ?? []).reduce((t, p) => t + (p.is_refund ? -Number(p.amount) : Number(p.amount)), 0);
  const roleCount: Record<string, number> = {};
  (members ?? []).forEach((m) => {
    if (m.status === "active") roleCount[m.role as string] = (roleCount[m.role as string] ?? 0) + 1;
  });

  return (
    <div>
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← All garages
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-text">{garage.name as string}</h1>
        <Badge tone={garage.status === "active" ? "green" : garage.status === "trial" ? "amber" : "red"}>
          {garage.status as string}
        </Badge>
      </div>
      <p className="mt-0.5 text-sm text-text-muted">
        /{garage.slug as string} · {garage.email as string} · created {shortDate(garage.created_at as string)}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Staff" value={(members ?? []).filter((m) => m.status === "active").length} />
        <StatCard label="Customers" value={customers ?? 0} />
        <StatCard label="Vehicles" value={vehicles ?? 0} />
        <StatCard label="Work orders" value={workOrders ?? 0} />
        <StatCard label="Revenue" value={money(revenue, garage.currency as string)} tone="green" />
        <StatCard label="Trial ends" value={garage.trial_ends_at ? shortDate(garage.trial_ends_at as string) : "—"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan & status</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <form action={setGaragePlan} className="flex items-end gap-2">
              <input type="hidden" name="garage_id" value={id} />
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-text-muted">Plan</span>
                <select
                  name="plan_id"
                  defaultValue={(garage.plan as unknown as { id: string } | null)?.id ?? ""}
                  className="w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-2"
                >
                  <option value="">None</option>
                  {(plans ?? []).map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {p.name as string}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded-[var(--radius)] bg-brand px-3 py-2 text-sm font-medium text-brand-fg">
                Save
              </button>
            </form>

            <form action={setGarageStatus} className="flex flex-wrap gap-2">
              <input type="hidden" name="garage_id" value={id} />
              {["trial", "active", "suspended", "cancelled"]
                .filter((s) => s !== garage.status)
                .map((s) => (
                  <button
                    key={s}
                    name="status"
                    value={s}
                    className="rounded border border-border px-2 py-1 text-xs capitalize hover:bg-surface-2"
                  >
                    Set {s}
                  </button>
                ))}
            </form>

            <div className="text-sm">
              <p className="mb-1 text-text-muted">Team</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(roleCount).map(([r, n]) => (
                  <Badge key={r} tone="blue">
                    {ROLE_LABELS[r as keyof typeof ROLE_LABELS]}: {n}
                  </Badge>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          {(recentAudit ?? []).length === 0 ? (
            <CardBody className="text-sm text-text-muted">No activity.</CardBody>
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Actor</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {(recentAudit ?? []).map((a, i) => (
                    <tr key={i}>
                      <Td className="whitespace-nowrap text-text-muted">{dateTime(a.created_at as string)}</Td>
                      <Td className="text-text-muted">{(a.actor_name as string) ?? "—"}</Td>
                      <Td>{a.action as string}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  );
}
