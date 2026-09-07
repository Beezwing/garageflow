"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import type { ActionState } from "@/lib/actions/types";

function parse(formData: FormData) {
  const int = (k: string) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  };
  return {
    customer_id: String(formData.get("customer_id") ?? "") || null,
    make: String(formData.get("make") ?? "").trim() || null,
    model: String(formData.get("model") ?? "").trim() || null,
    year: int("year"),
    license_plate: String(formData.get("license_plate") ?? "").trim().toUpperCase() || null,
    vin: String(formData.get("vin") ?? "").trim().toUpperCase() || null,
    engine_number: String(formData.get("engine_number") ?? "").trim().toUpperCase() || null,
    color: String(formData.get("color") ?? "").trim() || null,
    transmission: String(formData.get("transmission") ?? "").trim() || null,
    fuel_type: String(formData.get("fuel_type") ?? "").trim() || null,
    mileage: int("mileage"),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createVehicle(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { id?: string }> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "vehicle.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const data = parse(formData);
  if (!data.customer_id) return { error: "Choose an owner for this vehicle." };
  if (!data.make && !data.license_plate) return { error: "Enter at least a make or a plate." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicles")
    .insert({ ...data, garage_id: ctx.garage.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A vehicle with that plate or VIN already exists here." };
    return { error: error.message };
  }
  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "vehicle.created",
    entityType: "vehicle",
    entityId: row.id as string,
    after: data,
  });
  revalidatePath("/vehicles");
  return { ok: true, id: row.id as string };
}

export async function updateVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "vehicle.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get("id"));
  const data = parse(formData);
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update(data)
    .eq("id", id)
    .eq("garage_id", ctx.garage.id);
  if (error) {
    if (error.code === "23505") return { error: "A vehicle with that plate or VIN already exists here." };
    return { error: error.message };
  }
  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "vehicle.updated",
    entityType: "vehicle",
    entityId: id,
    after: data,
  });
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${id}`);
  return { ok: true };
}

export async function deleteVehicle(formData: FormData): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "vehicle.manage");
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { count } = await supabase
    .from("work_orders")
    .select("id", { count: "exact", head: true })
    .eq("vehicle_id", id)
    .not("status", "in", "(checked_out,cancelled)");
  if ((count ?? 0) > 0) throw new Error("This vehicle has open work orders.");

  const { error } = await supabase
    .from("vehicles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("garage_id", ctx.garage.id);
  if (error) throw new Error(error.message);
  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "vehicle.deleted",
    entityType: "vehicle",
    entityId: id,
  });
  revalidatePath("/vehicles");
}
