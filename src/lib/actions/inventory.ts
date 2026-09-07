"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import type { ActionState } from "@/lib/actions/types";

/* ------------------------------- suppliers --------------------------- */
export async function saveSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "inventory.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    contact_person: String(formData.get("contact_person") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim().toLowerCase() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  if (data.name.length < 2) return { error: "Supplier name is required." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("suppliers").update(data).eq("id", id).eq("garage_id", ctx.garage.id)
    : await supabase.from("suppliers").insert({ ...data, garage_id: ctx.garage.id });
  if (error) return { error: error.message };
  revalidatePath("/inventory/suppliers");
  return { ok: true };
}

export async function deleteSupplier(id: string): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "inventory.manage");
  const supabase = await createClient();
  await supabase
    .from("suppliers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("garage_id", ctx.garage.id);
  revalidatePath("/inventory/suppliers");
}

/* --------------------------------- parts ----------------------------- */
export async function savePart(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "inventory.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get("id") ?? "");
  const num = (k: string) => Math.max(0, Number(formData.get(k)) || 0);
  const data: Record<string, unknown> = {
    name: String(formData.get("name") ?? "").trim(),
    part_number: String(formData.get("part_number") ?? "").trim().toUpperCase() || null,
    category: String(formData.get("category") ?? "").trim() || null,
    supplier_id: String(formData.get("supplier_id") ?? "") || null,
    fitment: String(formData.get("fitment") ?? "").trim() || null,
    cost: num("cost"),
    price: num("price"),
    min_stock: num("min_stock"),
    location: String(formData.get("location") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  if ((data.name as string).length < 2) return { error: "Part name is required." };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("parts").update(data).eq("id", id).eq("garage_id", ctx.garage.id);
    if (error) return { error: error.code === "23505" ? "That part number is already used." : error.message };
  } else {
    // opening stock handled via a receive transaction so history is complete
    const opening = num("quantity");
    const { data: row, error } = await supabase
      .from("parts")
      .insert({ ...data, quantity: 0, garage_id: ctx.garage.id })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? "That part number is already used." : error.message };
    if (opening > 0) {
      await supabase.rpc("adjust_stock", {
        payload: { part_id: row.id, type: "receive", quantity_delta: opening, unit_cost: data.cost, note: "Opening stock" },
      });
    }
  }
  await writeAuditLog({
    garageId: ctx.garage.id,
    action: id ? "part.updated" : "part.created",
    entityType: "part",
    entityId: id || (data.name as string),
    after: data,
  });
  revalidatePath("/inventory/parts");
  return { ok: true };
}

export async function deletePart(id: string): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "inventory.manage");
  const supabase = await createClient();
  await supabase
    .from("parts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("garage_id", ctx.garage.id);
  revalidatePath("/inventory/parts");
}

export async function adjustStock(payload: {
  part_id: string;
  type: "receive" | "add" | "remove" | "adjust";
  quantity_delta: number;
  unit_cost?: number;
  supplier_id?: string;
  reference?: string;
  note?: string;
}): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "inventory.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    payload: {
      part_id: payload.part_id,
      type: payload.type,
      quantity_delta: payload.quantity_delta,
      unit_cost: payload.unit_cost ?? null,
      supplier_id: payload.supplier_id ?? null,
      reference: payload.reference ?? null,
      note: payload.note ?? null,
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/inventory/parts");
  revalidatePath(`/inventory/parts/${payload.part_id}`);
}
