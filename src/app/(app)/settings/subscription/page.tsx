import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money, shortDate } from "@/lib/format";
import { planLimits, planFeatures, limitLabel } from "@/lib/plan";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import type { SubscriptionPlan } from "@/types/domain";

export const metadata = { title: "Subscription" };

function Meter({ label, used, limit }: { label: string; used: number; limit: number | undefined }) {
  const unlimited = limit == null || limit < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className="text-text">
          {used.toLocaleString()} / {limitLabel(limit)}
        </span>
      </div>
      {!unlimited ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: pct > 85 ? "var(--tone-amber-fg)" : "var(--brand)" }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default async function SubscriptionPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "settings.manage")) redirect("/settings");
  const supabase = await createClient();
  const gid = ctx.garage.id;

  const [{ data: plan }, { data: plans }, { count: users }, { count: vehicles }] = await Promise.all([
    ctx.garage.plan_id
      ? supabase.from("subscription_plans").select("*").eq("id", ctx.garage.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("subscription_plans").select("*").eq("active", true).order("sort_order"),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("garage_id", gid).eq("status", "active"),
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("garage_id", gid).is("deleted_at", null),
  ]);

  const p = plan as SubscriptionPlan | null;
  const limits = planLimits(p);
  const features = planFeatures(p);

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <Badge tone={ctx.garage.status === "active" ? "green" : ctx.garage.status === "trial" ? "amber" : "red"}>
            {ctx.garage.status}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <p className="text-lg font-semibold text-text">{p?.name ?? "No plan"}</p>
            {p && p.price_monthly > 0 ? (
              <p className="text-sm text-text-muted">
                {money(p.price_monthly, ctx.garage.currency)}/mo · {money(p.price_annual, ctx.garage.currency)}/yr
              </p>
            ) : (
              <p className="text-sm text-text-muted">Free</p>
            )}
            {ctx.garage.trial_ends_at && ctx.garage.status === "trial" ? (
              <p className="mt-1 text-xs text-[var(--tone-amber-fg)]">
                Trial ends {shortDate(ctx.garage.trial_ends_at)}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <Meter label="Staff accounts" used={users ?? 0} limit={limits.users} />
            <Meter label="Vehicles" used={vehicles ?? 0} limit={limits.vehicles} />
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(features)
              .filter(([, on]) => on)
              .map(([k]) => (
                <Badge key={k} tone="blue">
                  {k.replace(/_/g, " ")}
                </Badge>
              ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {((plans ?? []) as SubscriptionPlan[]).map((pl) => {
            const lim = planLimits(pl);
            return (
              <div
                key={pl.id}
                className={`rounded-[var(--radius)] border p-3 ${
                  pl.id === ctx.garage.plan_id ? "border-brand bg-brand-soft" : "border-border"
                }`}
              >
                <p className="font-semibold text-text">{pl.name}</p>
                <p className="text-sm text-text-muted">
                  {pl.price_monthly > 0 ? `${money(pl.price_monthly, ctx.garage.currency)}/mo` : "Free"}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
                  <li>{limitLabel(lim.users)} staff</li>
                  <li>{limitLabel(lim.vehicles)} vehicles</li>
                  {Object.entries(planFeatures(pl))
                    .filter(([, on]) => on)
                    .map(([k]) => (
                      <li key={k}>✓ {k.replace(/_/g, " ")}</li>
                    ))}
                </ul>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <p className="text-xs text-text-subtle">
        To change plan, contact GarageFlow. Self-serve billing is coming.
      </p>
    </div>
  );
}
