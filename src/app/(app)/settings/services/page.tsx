import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money } from "@/lib/format";
import { Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { ServicesManager } from "./ServicesManager";

export const metadata = { title: "Services & pricing" };

export default async function ServicesPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "service.manage")) redirect("/settings");

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, category, description, default_price, est_labor_minutes, active")
    .eq("garage_id", ctx.garage.id)
    .order("category", { nullsFirst: false })
    .order("name");

  return (
    <div>
      <p className="mb-4 text-sm text-text-muted">
        Preset prices speed up billing — staff can still override or enter a custom charge on any job.
        Prices in {ctx.garage.currency}.
      </p>
      {(services ?? []).length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No services yet"
              description="Add the jobs you do most — oil change, brake service, diagnostics…"
            />
          </CardBody>
        </Card>
      ) : null}
      <ServicesManager
        currency={ctx.garage.currency}
        services={(services ?? []).map((s) => ({
          id: s.id as string,
          name: s.name as string,
          category: (s.category as string) ?? "",
          description: (s.description as string) ?? "",
          default_price: Number(s.default_price),
          est_labor_minutes: Number(s.est_labor_minutes),
          active: s.active as boolean,
        }))}
      />
      {(services ?? []).length ? (
        <p className="mt-3 text-xs text-text-subtle">
          {(services ?? []).filter((s) => s.active).length} active ·{" "}
          {money(
            (services ?? []).reduce((t, s) => t + Number(s.default_price), 0),
            ctx.garage.currency,
          )}{" "}
          catalogue value
        </p>
      ) : null}
    </div>
  );
}
