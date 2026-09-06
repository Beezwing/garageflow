import type { WorkOrderStatus, WorkOrderPriority } from "@/types/domain";

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  checked_in: "Checked in",
  awaiting_inspection: "Awaiting inspection",
  inspected: "Inspected",
  assignment_pending: "Assignment pending",
  assigned: "Assigned",
  in_progress: "In progress",
  awaiting_parts: "Awaiting parts",
  awaiting_customer_approval: "Awaiting approval",
  repair_completed: "Repair completed",
  quality_check: "Quality check",
  ready_for_payment: "Ready for payment",
  paid: "Paid",
  ready_for_pickup: "Ready for pickup",
  checked_out: "Checked out",
  cancelled: "Cancelled",
};

type BadgeTone = "gray" | "blue" | "amber" | "violet" | "green" | "red";

export const WORK_ORDER_STATUS_TONE: Record<WorkOrderStatus, BadgeTone> = {
  checked_in: "gray",
  awaiting_inspection: "amber",
  inspected: "blue",
  assignment_pending: "amber",
  assigned: "blue",
  in_progress: "violet",
  awaiting_parts: "amber",
  awaiting_customer_approval: "amber",
  repair_completed: "blue",
  quality_check: "violet",
  ready_for_payment: "green",
  paid: "green",
  ready_for_pickup: "green",
  checked_out: "gray",
  cancelled: "red",
};

/**
 * Allowed forward/lateral transitions. `cancelled` is reachable from any
 * non-terminal state. Guarded transitions (checkout with balance, additional
 * work without approval) are additionally enforced by RPCs in the database.
 */
const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  checked_in: ["awaiting_inspection", "cancelled"],
  awaiting_inspection: ["inspected", "cancelled"],
  inspected: ["assignment_pending", "assigned", "cancelled"],
  assignment_pending: ["assigned", "cancelled"],
  assigned: ["in_progress", "assignment_pending", "cancelled"],
  in_progress: [
    "awaiting_parts",
    "awaiting_customer_approval",
    "repair_completed",
    "assigned",
    "cancelled",
  ],
  awaiting_parts: ["in_progress", "cancelled"],
  awaiting_customer_approval: ["in_progress", "cancelled"],
  repair_completed: ["quality_check", "in_progress", "cancelled"],
  quality_check: ["ready_for_payment", "repair_completed", "cancelled"],
  ready_for_payment: ["paid", "ready_for_pickup", "cancelled"],
  paid: ["ready_for_pickup"],
  ready_for_pickup: ["checked_out"],
  checked_out: [],
  cancelled: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: WorkOrderStatus): WorkOrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

export const OPEN_STATUSES: WorkOrderStatus[] = [
  "checked_in",
  "awaiting_inspection",
  "inspected",
  "assignment_pending",
  "assigned",
  "in_progress",
  "awaiting_parts",
  "awaiting_customer_approval",
  "repair_completed",
  "quality_check",
  "ready_for_payment",
];

export const PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  normal: "Normal",
  urgent: "Urgent",
  emergency: "Emergency",
};

export const PRIORITY_TONE: Record<WorkOrderPriority, BadgeTone> = {
  normal: "gray",
  urgent: "amber",
  emergency: "red",
};
