"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import type { ActionState } from "@/lib/actions/types";

function parse(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim().toLowerCase() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState & { id?: string }> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "customer.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const data = parse(formData);
  if (data.name.length < 2) return { error: "Customer name is required." };

  const supabase = await createClient();

  // duplicate guard: same phone or email in this garage
  if (data.phone || data.email) {
    const { data: dupe } = await supabase
      .from("customers")
      .select("id, name")
      .eq("garage_id", ctx.garage.id)
      .is("deleted_at", null)
      .or(
        [data.phone ? `phone.eq.${data.phone}` : null, data.email ? `email.eq.${data.email}` : null]
          .filter(Boolean)
          .join(","),
      )
      .limit(1)
      .maybeSingle();
    if (dupe) return { error: `A customer with that phone/email already exists (${dupe.name}).` };
  }

  const { data: row, error } = await supabase
    .from("customers")
    .insert({ ...data, garage_id: ctx.garage.id, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "customer.created",
    entityType: "customer",
    entityId: row.id as string,
    after: data,
  });
  revalidatePath("/customers");
  return { ok: true, id: row.id as string };
}

export async function updateCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "customer.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get("id"));
  const data = parse(formData);
  if (data.name.length < 2) return { error: "Customer name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update(data)
    .eq("id", id)
    .eq("garage_id", ctx.garage.id);
  if (error) return { error: error.message };

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "customer.updated",
    entityType: "customer",
    entityId: id,
    after: data,
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

export async function deleteCustomer(formData: FormData): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "customer.manage");
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { count } = await supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) {
    throw new Error("Remove or reassign this customer's vehicles first.");
  }

  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("garage_id", ctx.garage.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "customer.deleted",
    entityType: "customer",
    entityId: id,
  });
  revalidatePath("/customers");
}
