"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { sendServiceReport } from "@/lib/service-report";

function rev(invoiceId: string, woId?: string) {
  revalidatePath("/billing/invoices");
  revalidatePath(`/billing/invoices/${invoiceId}`);
  revalidatePath("/billing/payments");
  revalidatePath("/dashboard");
  if (woId) revalidatePath(`/workshop/jobs/${woId}`);
}

export async function issueInvoice(invoiceId: string) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "invoice.manage");
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "unpaid", issued_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("garage_id", ctx.garage.id)
    .eq("status", "draft");
  if (error) throw new Error(error.message);
  await supabase.rpc("recalc_invoice", { p_invoice: invoiceId });
  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "invoice.issued",
    entityType: "invoice",
    entityId: invoiceId,
  });
  rev(invoiceId);
}

export async function addInvoiceItem(
  invoiceId: string,
  form: { kind: string; description: string; quantity: number; unit_price: number },
) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "invoice.manage");
  const supabase = await createClient();
  const amount =
    form.kind === "discount"
      ? -Math.abs(form.quantity * form.unit_price)
      : form.quantity * form.unit_price;
  const { error } = await supabase.from("invoice_items").insert({
    garage_id: ctx.garage.id,
    invoice_id: invoiceId,
    kind: form.kind,
    description: form.description,
    quantity: form.quantity,
    unit_price: form.unit_price,
    amount,
  });
  if (error) throw new Error(error.message);
  rev(invoiceId);
}

export async function removeInvoiceItem(invoiceId: string, itemId: string) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "invoice.manage");
  const supabase = await createClient();
  await supabase.from("invoice_items").delete().eq("id", itemId).eq("garage_id", ctx.garage.id);
  rev(invoiceId);
}

export async function recordPayment(
  invoiceId: string,
  form: { amount: number; method: string; reference?: string; notes?: string; is_refund?: boolean },
) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "payment.record");
  if (!(form.amount > 0)) throw new Error("Enter a payment amount.");
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    garage_id: ctx.garage.id,
    invoice_id: invoiceId,
    amount: form.amount,
    method: form.method,
    reference: form.reference || null,
    notes: form.notes || null,
    is_refund: !!form.is_refund,
    received_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  rev(invoiceId);
}

export async function cancelInvoice(invoiceId: string) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "invoice.manage");
  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId)
    .eq("garage_id", ctx.garage.id);
  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "invoice.cancelled",
    entityType: "invoice",
    entityId: invoiceId,
  });
  rev(invoiceId);
}

export async function checkOutVehicle(payload: {
  work_order_id: string;
  collected_by_name: string;
  relationship?: string;
  id_verified: boolean;
  final_mileage?: number;
  notes?: string;
  customer_notes?: string;
  checklist: { item: string; checked: boolean }[];
  customer_signature?: string;
  override_reason?: string;
}) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "checkout.perform");
  const supabase = await createClient();

  let overrideId: string | null = null;
  if (payload.override_reason) {
    const { data, error } = await supabase.rpc("create_override", {
      payload: {
        garage_id: ctx.garage.id,
        kind: "checkout",
        work_order_id: payload.work_order_id,
        reason: payload.override_reason,
      },
    });
    if (error) throw new Error(error.message);
    overrideId = data as string;
  }

  const { error } = await supabase.rpc("check_out_vehicle", {
    payload: {
      work_order_id: payload.work_order_id,
      collected_by_name: payload.collected_by_name,
      relationship: payload.relationship ?? null,
      id_verified: payload.id_verified,
      final_mileage: payload.final_mileage ?? null,
      notes: payload.notes ?? null,
      customer_notes: payload.customer_notes ?? null,
      checklist: payload.checklist,
      customer_signature: payload.customer_signature ?? null,
      override_id: overrideId,
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/workshop/jobs/${payload.work_order_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/workshop/jobs");

  // best-effort — a report failing to send should never block the release
  void sendServiceReport(payload.work_order_id);
}
