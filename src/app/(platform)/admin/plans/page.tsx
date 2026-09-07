import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { money } from "@/lib/format";
import { limitLabel, planLimits, planFeatures } from "@/lib/plan";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import type { SubscriptionPlan } from "@/types/domain";
import { PlanEditor } from "./PlanEditor";

export const metadata = { title: "Plans" };

export default async function PlansPage() {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) redirect("/");
  const supabase = await createClient();
  const { data: plans } = await supabase.from("subscription_plans").select("*").order("sort_order");
  const [{ count: garages }] = await Promise.all([
    supabase.from("garages").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Subscription plans</h1>
          <p className="mt-0.5 text-sm text-text-muted">{garages ?? 0} garages across all plans</p>
        </div>
        <PlanEditor />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {((plans ?? []) as SubscriptionPlan[]).map((p) => {
          const lim = planLimits(p);
          const feats = planFeatures(p);
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <div className="flex items-center gap-2">
                  {!p.active ? <Badge tone="gray">inactive</Badge> : null}
                  <PlanEditor plan={p} />
                </div>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                <p className="font-mono text-xs text-text-subtle">{p.code}</p>
                <p className="text-text">
                  {p.price_monthly > 0 ? `${money(p.price_monthly, "JMD")}/mo` : "Free"}
                </p>
                <ul className="space-y-0.5 text-text-muted">
                  <li>{limitLabel(lim.users)} staff</li>
                  <li>{limitLabel(lim.vehicles)} vehicles</li>
                  <li>{limitLabel(lim.storage_mb)} MB storage</li>
                </ul>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(feats)
                    .filter(([, on]) => on)
                    .map(([k]) => (
                      <Badge key={k} tone="blue">
                        {k.replace(/_/g, " ")}
                      </Badge>
                    ))}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
