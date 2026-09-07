"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import type { ActionState } from "@/lib/actions/types";

export async function saveService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "service.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    default_price: Math.max(0, Number(formData.get("default_price")) || 0),
    est_labor_minutes: Math.max(0, Math.round(Number(formData.get("est_labor_minutes")) || 0)),
    active: formData.get("active") !== "false",
  };
  if (data.name.length < 2) return { error: "Service name is required." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("services").update(data).eq("id", id).eq("garage_id", ctx.garage.id)
    : await supabase.from("services").insert({ ...data, garage_id: ctx.garage.id });
  if (error) return { error: error.message };

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: id ? "service.updated" : "service.created",
    entityType: "service",
    entityId: id || data.name,
    after: data,
  });
  revalidatePath("/settings/services");
  return { ok: true };
}

export async function toggleService(id: string, active: boolean): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "service.manage");
  const supabase = await createClient();
  await supabase.from("services").update({ active }).eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/settings/services");
}

export async function deleteService(id: string): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "service.manage");
  const supabase = await createClient();
  await supabase.from("services").delete().eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/settings/services");
}
