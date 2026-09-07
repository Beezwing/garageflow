import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, shortDate } from "@/lib/format";
import { setGarageStatus } from "@/lib/actions/platform";
import { StatCard } from "@/components/ui/StatCard";
import {
  Card,
  CardHeader,
  CardTitle,
  Badge,
  TableWrap,
  Table,
  Th,
  Td,
  EmptyState,
} from "@/components/ui/primitives";

export const metadata = { title: "Platform overview" };

const STATUS_TONE = {
  trial: "amber",
  active: "green",
  suspended: "red",
  cancelled: "gray",
} as const;

export default async function AdminPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: stats } = await supabase.rpc("platform_stats");
  const { data: garages } = await supabase
    .from("garages")
    .select("id, name, slug, status, currency, created_at, plan:subscription_plans(name)")
    .order("created_at", { ascending: false });

  const s = (stats ?? {}) as Record<string, number>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-text">Platform overview</h1>
      <p className="mt-0.5 text-sm text-text-muted">Every garage on GarageFlow.</p>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Garages" value={s.garages_total ?? 0} />
        <StatCard label="Active" value={s.garages_active ?? 0} tone="green" />
        <StatCard label="Trial" value={s.garages_trial ?? 0} tone="amber" />
        <StatCard label="Suspended" value={s.garages_suspended ?? 0} tone="red" />
        <StatCard label="Users" value={s.users_total ?? 0} />
        <StatCard label="Work orders" value={s.work_orders_total ?? 0} />
      </section>

      <section className="mt-4">
        <StatCard label="Platform revenue recorded" value={money(s.revenue_total ?? 0, "JMD")} tone="green" />
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Garages</CardTitle>
          </CardHeader>
          {(garages ?? []).length === 0 ? (
            <EmptyState title="No garages yet" />
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Garage</Th>
                    <Th>Plan</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {(garages ?? []).map((g) => {
                    const plan = g.plan as unknown as { name: string } | null;
                    const status = g.status as keyof typeof STATUS_TONE;
                    return (
                      <tr key={g.id as string} className="hover:bg-surface-2">
                        <Td>
                          <a href={`/admin/garages/${g.id}`} className="font-medium text-brand hover:underline">
                            {g.name as string}
                          </a>
                          <span className="ml-1 text-xs text-text-subtle">/{g.slug as string}</span>
                        </Td>
                        <Td className="text-text-muted">{plan?.name ?? "—"}</Td>
                        <Td>
                          <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                        </Td>
                        <Td className="text-text-muted">{shortDate(g.created_at as string)}</Td>
                        <Td className="text-right">
                          <form action={setGarageStatus} className="inline-flex gap-1">
                            <input type="hidden" name="garage_id" value={g.id as string} />
                            {status !== "active" ? (
                              <button
                                name="status"
                                value="active"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
                              >
                                Activate
                              </button>
                            ) : null}
                            {status !== "suspended" ? (
                              <button
                                name="status"
                                value="suspended"
                                className="rounded border border-border px-2 py-1 text-xs text-[var(--tone-red-fg)] hover:bg-surface-2"
                              >
                                Suspend
                              </button>
                            ) : null}
                          </form>
                        </Td>
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
