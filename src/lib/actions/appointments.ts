"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import type { ActionState } from "@/lib/actions/types";

export async function saveAppointment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "customer.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "09:00");
  if (!date) return { error: "Pick a date." };

  const data = {
    customer_id: String(formData.get("customer_id") ?? "") || null,
    vehicle_id: String(formData.get("vehicle_id") ?? "") || null,
    service_id: String(formData.get("service_id") ?? "") || null,
    title: String(formData.get("title") ?? "").trim() || null,
    scheduled_at: new Date(`${date}T${time}`).toISOString(),
    duration_min: Math.max(15, Number(formData.get("duration_min")) || 60),
    notes: String(formData.get("notes") ?? "").trim() || null,
    status: String(formData.get("status") ?? "scheduled"),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("appointments").update(data).eq("id", id).eq("garage_id", ctx.garage.id)
    : await supabase.from("appointments").insert({ ...data, garage_id: ctx.garage.id });
  if (error) return { error: error.message };
  revalidatePath("/workshop/appointments");
  return { ok: true };
}

export async function setAppointmentStatus(id: string, status: string): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "customer.manage");
  const supabase = await createClient();
  await supabase.from("appointments").update({ status }).eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/workshop/appointments");
}

export async function respondToAppointmentRequest(
  id: string,
  action: "confirm" | "propose",
  opts: { proposed_at?: string; staff_note?: string } = {},
): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "customer.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_respond_appointment_request", {
    payload: {
      appointment_id: id,
      action,
      proposed_at: opts.proposed_at ?? null,
      staff_note: opts.staff_note ?? null,
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/workshop/appointments");
}

export async function deleteAppointment(id: string): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "customer.manage");
  const supabase = await createClient();
  await supabase.from("appointments").delete().eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/workshop/appointments");
}
