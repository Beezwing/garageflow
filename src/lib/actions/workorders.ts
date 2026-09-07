"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan, can } from "@/lib/permissions";
import { canTransition } from "@/lib/status";
import { writeAuditLog } from "@/lib/audit";
import type { WorkOrderStatus } from "@/types/domain";

async function loadWO(id: string) {
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, garage_id, number, status")
    .eq("id", id)
    .eq("garage_id", ctx.garage.id)
    .maybeSingle();
  if (!wo) throw new Error("Work order not found");
  return { ctx, supabase, wo: wo as { id: string; garage_id: string; number: string; status: WorkOrderStatus } };
}

function revalidateWO(id: string) {
  revalidatePath(`/workshop/jobs/${id}`);
  revalidatePath("/workshop/jobs");
  revalidatePath("/dashboard");
  revalidatePath("/workshop/my-jobs");
}

export async function setWorkOrderStatus(id: string, to: WorkOrderStatus, reason?: string) {
  const { ctx, supabase, wo } = await loadWO(id);
  if (!canTransition(wo.status, to)) {
    throw new Error(`Can't move a job from "${wo.status}" to "${to}".`);
  }
  if (to === "checked_out") {
    throw new Error("Use the checkout flow to release a vehicle.");
  }
  const patch: Record<string, unknown> = { status: to };
  if (to === "repair_completed" || to === "quality_check") patch.completed_at = new Date().toISOString();
  if (to === "cancelled") patch.cancelled_reason = reason ?? null;

  const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    garageId: wo.garage_id,
    action: "work_order.status_changed",
    entityType: "work_order",
    entityId: id,
    before: { status: wo.status },
    after: { status: to },
    reason,
  });
  await supabase.from("notifications").insert({
    garage_id: wo.garage_id,
    roles: ["garage_admin", "supervisor"],
    title: `${wo.number} → ${to.replaceAll("_", " ")}`,
    body: reason ?? null,
    entity_type: "work_order",
    entity_id: id,
  });
  revalidateWO(id);
}

export async function updateWorkOrder(id: string, formData: FormData) {
  const { supabase, wo } = await loadWO(id);
  const patch = {
    complaint: String(formData.get("complaint") ?? "").trim() || null,
    requested_work: String(formData.get("requested_work") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    priority: String(formData.get("priority") ?? "normal"),
    expected_completion: String(formData.get("expected_completion") ?? "") || null,
  };
  const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await writeAuditLog({
    garageId: wo.garage_id,
    action: "work_order.updated",
    entityType: "work_order",
    entityId: id,
    after: patch,
  });
  revalidateWO(id);
}

/* ------------------------------- tasks -------------------------------- */
export async function addTask(id: string, title: string, assignedTo?: string) {
  const { ctx, supabase, wo } = await loadWO(id);
  assertCan(ctx.role, "task.manage");
  if (!title.trim()) throw new Error("Task needs a title.");
  const { count } = await supabase
    .from("work_order_tasks")
    .select("id", { count: "exact", head: true })
    .eq("work_order_id", id);
  const { error } = await supabase.from("work_order_tasks").insert({
    garage_id: wo.garage_id,
    work_order_id: id,
    title: title.trim(),
    assigned_to: assignedTo || null,
    sequence: (count ?? 0) + 1,
  });
  if (error) throw new Error(error.message);
  revalidateWO(id);
}

export async function setTaskStatus(taskId: string, status: string, unableReason?: string) {
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("work_order_tasks")
    .select("id, garage_id, work_order_id, assigned_to")
    .eq("id", taskId)
    .eq("garage_id", ctx.garage.id)
    .maybeSingle();
  if (!task) throw new Error("Task not found");
  const isAssignee = task.assigned_to === ctx.userId;
  if (!isAssignee && !can(ctx.role, "task.manage")) {
    throw new Error("Only the assigned technician or a supervisor can update this task.");
  }
  if (status === "unable" && !unableReason?.trim()) {
    throw new Error("Explain why the task can't be completed.");
  }
  const { error } = await supabase
    .from("work_order_tasks")
    .update({
      status,
      unable_reason: status === "unable" ? unableReason : null,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidateWO(task.work_order_id as string);
}

export async function deleteTask(taskId: string) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "task.manage");
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("work_order_tasks")
    .select("work_order_id")
    .eq("id", taskId)
    .eq("garage_id", ctx.garage.id)
    .maybeSingle();
  await supabase.from("work_order_tasks").delete().eq("id", taskId).eq("garage_id", ctx.garage.id);
  if (task) revalidateWO(task.work_order_id as string);
}

export async function applyChecklistTemplate(id: string, templateId: string) {
  const { ctx, supabase, wo } = await loadWO(id);
  assertCan(ctx.role, "task.manage");
  const { data: tpl } = await supabase
    .from("checklist_templates")
    .select("items")
    .eq("id", templateId)
    .eq("garage_id", wo.garage_id)
    .maybeSingle();
  const items = (tpl?.items as string[]) ?? [];
  if (!items.length) return;
  await supabase.from("work_order_tasks").insert(
    items.map((t, i) => ({
      garage_id: wo.garage_id,
      work_order_id: id,
      title: t,
      sequence: i + 1,
    })),
  );
  revalidateWO(id);
}

/* --------------------------- assignments ----------------------------- */
export async function assignTechnician(id: string, technicianId: string, scope?: string) {
  const { ctx, supabase, wo } = await loadWO(id);
  assertCan(ctx.role, "workorder.assign");
  const { error } = await supabase.from("technician_assignments").insert({
    garage_id: wo.garage_id,
    work_order_id: id,
    technician_id: technicianId,
    scope: scope || null,
    assigned_by: ctx.userId,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  if (wo.status === "inspected" || wo.status === "assignment_pending") {
    await supabase.from("work_orders").update({ status: "assigned" }).eq("id", id);
  }
  await supabase.from("notifications").insert({
    garage_id: wo.garage_id,
    user_id: technicianId,
    title: `You're assigned to ${wo.number}`,
    body: scope || null,
    entity_type: "work_order",
    entity_id: id,
  });
  await writeAuditLog({
    garageId: wo.garage_id,
    action: "work_order.technician_assigned",
    entityType: "work_order",
    entityId: id,
    after: { technicianId, scope },
  });
  revalidateWO(id);
}

export async function unassignTechnician(assignmentId: string) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "workorder.assign");
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("technician_assignments")
    .select("work_order_id")
    .eq("id", assignmentId)
    .eq("garage_id", ctx.garage.id)
    .maybeSingle();
  await supabase.from("technician_assignments").delete().eq("id", assignmentId).eq("garage_id", ctx.garage.id);
  if (a) revalidateWO(a.work_order_id as string);
}

/* ----------------------- charges: labor/services/parts --------------- */
export async function addLabor(id: string, form: { description: string; hours: number; rate: number; technician_id?: string }) {
  const { ctx, supabase, wo } = await loadWO(id);
  assertCan(ctx.role, "price.override");
  const { error } = await supabase.from("work_order_labor").insert({
    garage_id: wo.garage_id,
    work_order_id: id,
    description: form.description,
    hours: form.hours,
    rate: form.rate,
    technician_id: form.technician_id || null,
    created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  revalidateWO(id);
}

export async function addServiceLine(id: string, form: { service_id?: string; description: string; quantity: number; unit_price: number }) {
  const { ctx, supabase, wo } = await loadWO(id);
  assertCan(ctx.role, "price.override");
  const { error } = await supabase.from("work_order_services").insert({
    garage_id: wo.garage_id,
    work_order_id: id,
    service_id: form.service_id || null,
    description: form.description,
    quantity: form.quantity,
    unit_price: form.unit_price,
    created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  revalidateWO(id);
}

export async function addPartLine(id: string, form: { part_id?: string; description: string; quantity: number; unit_price?: number }) {
  const { ctx, supabase } = await loadWO(id);
  assertCan(ctx.role, "part.useOnJob");
  const { error } = await supabase.rpc("use_part_on_work_order", {
    payload: {
      work_order_id: id,
      part_id: form.part_id || null,
      description: form.description,
      quantity: form.quantity,
      unit_price: form.unit_price ?? null,
    },
  });
  if (error) throw new Error(error.message);
  void ctx;
  revalidateWO(id);
}

export async function removeChargeLine(table: "work_order_labor" | "work_order_services" | "work_order_parts", lineId: string, woId: string) {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "price.override");
  const supabase = await createClient();
  await supabase.from(table).delete().eq("id", lineId).eq("garage_id", ctx.garage.id);
  revalidateWO(woId);
}

/* --------------------------- additional work ------------------------- */
export async function requestAdditionalWork(
  id: string,
  form: { problem: string; recommendation?: string; parts_estimate: number; labor_estimate: number; price: number; technician_notes?: string },
) {
  const { ctx, supabase, wo } = await loadWO(id);
  assertCan(ctx.role, "additionalWork.request");
  const { error } = await supabase.from("additional_work_requests").insert({
    garage_id: wo.garage_id,
    work_order_id: id,
    problem: form.problem,
    recommendation: form.recommendation || null,
    parts_estimate: form.parts_estimate,
    labor_estimate: form.labor_estimate,
    price: form.price,
    technician_notes: form.technician_notes || null,
    requested_by: ctx.userId,
    status: "pending",
  });
  if (error) throw new Error(error.message);
  await supabase.from("notifications").insert({
    garage_id: wo.garage_id,
    roles: ["garage_admin", "supervisor", "receptionist"],
    title: `${wo.number}: additional work needs customer approval`,
    body: `${form.problem} — JMD ${form.price}`,
    entity_type: "work_order",
    entity_id: id,
  });
  revalidateWO(id);
}

export async function recordApproval(
  requestId: string,
  woId: string,
  form: { decision: "approved" | "declined"; amount?: number; method?: string; notes?: string; customer_signature?: string },
) {
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_customer_approval", {
    payload: { request_id: requestId, ...form },
  });
  if (error) throw new Error(error.message);
  void ctx;
  revalidateWO(woId);
}

export async function overrideAdditionalWork(requestId: string, woId: string, garageId: string, reason: string, amount?: number) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_override", {
    payload: { garage_id: garageId, kind: "additional_work", work_order_id: woId, request_id: requestId, reason, amount: amount ?? null },
  });
  if (error) throw new Error(error.message);
  revalidateWO(woId);
}

/* ----------------------------- quality ------------------------------- */
export async function submitQualityInspection(
  id: string,
  form: { checklist: { item: string; checked: boolean }[]; passed: boolean; notes?: string },
) {
  const { ctx, supabase, wo } = await loadWO(id);
  assertCan(ctx.role, "quality.perform");
  const { error } = await supabase.from("quality_inspections").insert({
    garage_id: wo.garage_id,
    work_order_id: id,
    checklist: form.checklist,
    passed: form.passed,
    notes: form.notes || null,
    supervisor_id: ctx.userId,
  });
  if (error) throw new Error(error.message);
  if (form.passed && canTransition(wo.status, "ready_for_payment")) {
    await supabase.from("work_orders").update({ status: "ready_for_payment" }).eq("id", id);
  }
  await writeAuditLog({
    garageId: wo.garage_id,
    action: "work_order.quality_inspected",
    entityType: "work_order",
    entityId: id,
    after: { passed: form.passed },
  });
  revalidateWO(id);
}

/* ----------------------------- billing ------------------------------- */
export async function generateInvoice(id: string) {
  const { ctx, supabase } = await loadWO(id);
  assertCan(ctx.role, "invoice.manage");
  const { data, error } = await supabase.rpc("generate_invoice", { p_work_order: id });
  if (error) throw new Error(error.message);
  revalidateWO(id);
  return data as string;
}
