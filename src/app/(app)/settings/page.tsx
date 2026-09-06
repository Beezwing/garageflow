import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { BusinessSettingsForm } from "./BusinessSettingsForm";

export const metadata = { title: "Business settings" };

export default async function BusinessSettingsPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "settings.manage")) redirect("/settings/staff");

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("garage_settings")
    .select("payment_methods, allow_negative_stock")
    .eq("garage_id", ctx.garage.id)
    .maybeSingle();

  return (
    <BusinessSettingsForm
      garage={ctx.garage}
      paymentMethods={(settings?.payment_methods as string[]) ?? ["cash", "card", "bank_transfer"]}
      allowNegativeStock={Boolean(settings?.allow_negative_stock)}
    />
  );
}
