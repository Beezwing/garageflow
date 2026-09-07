import { notFound, redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui/primitives";
import { CheckoutForm } from "./CheckoutForm";

export const metadata = { title: "Vehicle checkout" };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "checkout.perform")) redirect(`/workshop/jobs/${id}`);
  const supabase = await createClient();

  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, number, status, mileage_out, customer:customers(name), vehicle:vehicles(make, model, license_plate)")
    .eq("id", id)
    .eq("garage_id", ctx.garage.id)
    .maybeSingle();
  if (!wo) notFound();

  const [{ data: invoices }, { data: quality }, { data: tpl }] = await Promise.all([
    supabase.from("invoices").select("balance, status").eq("work_order_id", id).not("status", "in", "(cancelled,draft)"),
    supabase.from("quality_inspections").select("passed").eq("work_order_id", id).order("created_at", { ascending: false }).limit(1),
    supabase.from("checklist_templates").select("items").eq("garage_id", ctx.garage.id).eq("kind", "checkout").eq("is_default", true).maybeSingle(),
  ]);

  const balance = (invoices ?? []).reduce((t, i) => t + Number(i.balance), 0);
  const qualityPassed = (quality ?? [])[0]?.passed === true;
  const v = wo.vehicle as unknown as { make: string; model: string; license_plate: string } | null;
  const c = wo.customer as unknown as { name: string } | null;

  if (wo.status === "checked_out") {
    return (
      <div>
        <PageHeader title={`${wo.number} — checked out`} description="This vehicle has already been released." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={`Check out — ${wo.number}`}
        description={`${v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : ""} ${v?.license_plate ?? ""} · ${c?.name ?? ""}`}
      />
      <CheckoutForm
        workOrderId={id}
        balance={balance}
        currency={ctx.garage.currency}
        qualityPassed={qualityPassed}
        canOverride={can(ctx.role, "override.perform")}
        customerName={c?.name ?? ""}
        checks={(tpl?.items as string[]) ?? undefined}
      />
      {balance > 0 ? (
        <p className="mt-3 text-sm text-[var(--tone-amber-fg)]">
          Outstanding balance: {money(balance, ctx.garage.currency)}. Settle it, or an authorised user must
          record a checkout override.
        </p>
      ) : null}
    </div>
  );
}
