import type { MembershipRole } from "@/types/domain";

/**
 * Capability matrix. The database (RLS + SECURITY DEFINER RPCs) is the real
 * enforcement layer — this mirror drives UI (hide/disable) and server-action
 * pre-checks so we fail fast with a clear message.
 */
export const CAPABILITIES = {
  // staff / settings
  "staff.manage": ["garage_admin"],
  "settings.manage": ["garage_admin"],
  "billing.settings": ["garage_admin"],
  "audit.view": ["garage_admin", "supervisor"],

  // customers & vehicles
  "customer.manage": ["garage_admin", "supervisor", "receptionist"],
  "vehicle.manage": ["garage_admin", "supervisor", "receptionist"],
  "vehicle.checkin": ["garage_admin", "supervisor", "receptionist"],

  // workshop
  "inspection.perform": ["garage_admin", "supervisor", "technician"],
  "workorder.create": ["garage_admin", "supervisor", "receptionist"],
  "workorder.assign": ["garage_admin", "supervisor"],
  "task.manage": ["garage_admin", "supervisor"],
  "task.workOwn": ["garage_admin", "supervisor", "technician"],
  "time.track": ["garage_admin", "supervisor", "technician"],

  // approvals
  "additionalWork.request": ["garage_admin", "supervisor", "technician"],
  "additionalWork.recordApproval": ["garage_admin", "supervisor", "receptionist"],
  "override.perform": ["garage_admin", "supervisor"],

  // services / pricing
  "service.manage": ["garage_admin", "supervisor"],
  "price.override": ["garage_admin", "supervisor", "receptionist"],

  // inventory
  "inventory.view": ["garage_admin", "supervisor", "technician", "receptionist"],
  "inventory.manage": ["garage_admin", "supervisor"],
  "part.useOnJob": ["garage_admin", "supervisor", "technician"],

  // billing
  "invoice.manage": ["garage_admin", "supervisor", "receptionist"],
  "payment.record": ["garage_admin", "supervisor", "receptionist"],
  "quality.perform": ["garage_admin", "supervisor"],
  "checkout.perform": ["garage_admin", "supervisor", "receptionist"],

  // reports
  "reports.view": ["garage_admin", "supervisor"],
} satisfies Record<string, MembershipRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: MembershipRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return (CAPABILITIES[capability] as readonly MembershipRole[]).includes(role);
}

export function assertCan(role: MembershipRole | null | undefined, capability: Capability): void {
  if (!can(role, capability)) {
    throw new Error(`You do not have permission to perform this action (${capability}).`);
  }
}

export const ROLE_LABELS: Record<MembershipRole, string> = {
  garage_admin: "Garage Admin",
  supervisor: "Supervisor",
  technician: "Technician",
  receptionist: "Service Advisor",
};

/** Default landing route per role after sign-in. */
export function homeForRole(role: MembershipRole): string {
  return role === "technician" ? "/workshop/my-jobs" : "/dashboard";
}
