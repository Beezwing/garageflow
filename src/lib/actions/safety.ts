"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import type { ActionState } from "@/lib/actions/types";

export interface SafetyTip {
  id: string;
  garage_id: string | null;
  title: string;
  body: string;
  category: string | null;
  severity: "info" | "warning" | "critical";
  active: boolean;
  sort_order: number;
}

const SEVERITIES = ["info", "warning", "critical"];

export async function saveSafetyTip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "service.manage"); // admin / supervisor
  } catch (e) {
    return { error: (e as Error).message };
  }

  const id = String(formData.get("id") ?? "");
  const severity = String(formData.get("severity") ?? "info");
  const data = {
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    severity: SEVERITIES.includes(severity) ? severity : "info",
    sort_order: Math.round(Number(formData.get("sort_order")) || 100),
    active: formData.get("active") !== "false",
  };
  if (data.title.length < 3) return { error: "Give the tip a short title." };
  if (data.body.length < 5) return { error: "Add the reminder text." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("safety_tips").update(data).eq("id", id).eq("garage_id", ctx.garage.id)
    : await supabase.from("safety_tips").insert({ ...data, garage_id: ctx.garage.id, created_by: ctx.userId });
  if (error) return { error: error.message };

  revalidatePath("/settings/safety");
  revalidatePath("/safety");
  return { ok: true };
}

export async function toggleSafetyTip(id: string, active: boolean): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "service.manage");
  const supabase = await createClient();
  await supabase.from("safety_tips").update({ active }).eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/settings/safety");
  revalidatePath("/safety");
}

export async function deleteSafetyTip(id: string): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "service.manage");
  const supabase = await createClient();
  await supabase.from("safety_tips").delete().eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/settings/safety");
  revalidatePath("/safety");
}
