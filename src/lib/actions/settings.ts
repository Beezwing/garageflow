"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import type { ActionState } from "@/lib/actions/types";

export async function updateGarageSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "settings.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }

  const num = (k: string, fallback: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? v : fallback;
  };

  const patch = {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    tax_number: String(formData.get("tax_number") ?? "").trim() || null,
    business_reg: String(formData.get("business_reg") ?? "").trim() || null,
    currency: String(formData.get("currency") ?? "JMD").trim() || "JMD",
    tax_label: String(formData.get("tax_label") ?? "GCT").trim() || "GCT",
    tax_rate: Math.max(0, Math.min(1, num("tax_rate", 0.15))),
    labor_rate: Math.max(0, num("labor_rate", 0)),
  };

  if (patch.name.length < 2) return { error: "Garage name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("garages").update(patch).eq("id", ctx.garage.id);
  if (error) return { error: error.message };

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "garage.settings_updated",
    entityType: "garage",
    entityId: ctx.garage.id,
    after: patch,
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateOperationalSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "settings.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }

  const payment_methods = formData.getAll("payment_methods").map(String);
  const allow_negative_stock = formData.get("allow_negative_stock") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("garage_settings")
    .upsert(
      { garage_id: ctx.garage.id, payment_methods, allow_negative_stock },
      { onConflict: "garage_id" },
    );
  if (error) return { error: error.message };

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "garage.operational_settings_updated",
    entityType: "garage_settings",
    entityId: ctx.garage.id,
    after: { payment_methods, allow_negative_stock },
  });

  revalidatePath("/settings");
  return { ok: true };
}
