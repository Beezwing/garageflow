"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import type { GarageStatus } from "@/types/domain";

export async function setGaragePlan(formData: FormData): Promise<void> {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) throw new Error("Forbidden");
  const garageId = String(formData.get("garage_id"));
  const planId = String(formData.get("plan_id")) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("garages").update({ plan_id: planId }).eq("id", garageId);
  if (error) throw new Error(error.message);
  await writeAuditLog({
    garageId,
    action: "platform.garage_plan_changed",
    entityType: "garage",
    entityId: garageId,
    after: { plan_id: planId },
  });
  revalidatePath("/admin/garages/" + garageId);
  revalidatePath("/admin");
}

export async function savePlan(formData: FormData): Promise<void> {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) throw new Error("Forbidden");
  const id = String(formData.get("id") ?? "");
  const data = {
    code: String(formData.get("code") ?? "").trim().toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    price_monthly: Math.max(0, Number(formData.get("price_monthly")) || 0),
    price_annual: Math.max(0, Number(formData.get("price_annual")) || 0),
    limits: {
      users: Number(formData.get("limit_users")) || -1,
      vehicles: Number(formData.get("limit_vehicles")) || -1,
      storage_mb: Number(formData.get("limit_storage")) || -1,
    },
    features: {
      reports: formData.get("f_reports") === "on",
      customer_portal: formData.get("f_portal") === "on",
      inventory: formData.get("f_inventory") === "on",
      api: formData.get("f_api") === "on",
      sso: formData.get("f_sso") === "on",
    },
    sort_order: Number(formData.get("sort_order")) || 0,
    active: formData.get("active") === "true",
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("subscription_plans").update(data).eq("id", id)
    : await supabase.from("subscription_plans").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/plans");
}

export async function setGarageStatus(formData: FormData): Promise<void> {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) throw new Error("Forbidden");

  const garageId = String(formData.get("garage_id"));
  const status = String(formData.get("status")) as GarageStatus;
  if (!["trial", "active", "suspended", "cancelled"].includes(status)) {
    throw new Error("Invalid status");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("garages").update({ status }).eq("id", garageId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    garageId,
    action: "platform.garage_status_changed",
    entityType: "garage",
    entityId: garageId,
    after: { status },
  });
  revalidatePath("/admin");
}
