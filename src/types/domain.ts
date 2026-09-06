// Domain types — the source of truth for component props across GarageFlow.
// Kept in sync by hand with supabase/migrations.

export type MembershipRole = "garage_admin" | "supervisor" | "technician" | "receptionist";
export type PlatformRole = "super_admin";
export type GarageStatus = "trial" | "active" | "suspended" | "cancelled";

export type WorkOrderStatus =
  | "checked_in"
  | "awaiting_inspection"
  | "inspected"
  | "assignment_pending"
  | "assigned"
  | "in_progress"
  | "awaiting_parts"
  | "awaiting_customer_approval"
  | "repair_completed"
  | "quality_check"
  | "ready_for_payment"
  | "paid"
  | "ready_for_pickup"
  | "checked_out"
  | "cancelled";

export type WorkOrderPriority = "normal" | "urgent" | "emergency";
export type TaskStatus = "not_started" | "in_progress" | "completed" | "unable";
export type ApprovalStatus = "pending" | "approved" | "declined" | "overridden";
export type InvoiceStatus = "draft" | "unpaid" | "partial" | "paid" | "cancelled" | "refunded";
export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "completed"
  | "cancelled"
  | "no_show";
export type InventoryTxnType = "receive" | "add" | "remove" | "adjust" | "use" | "return";
export type OverrideKind = "additional_work" | "checkout" | "price_change" | "negative_stock";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  platform_role: PlatformRole | null;
}

export interface Garage {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
  business_reg: string | null;
  currency: string;
  tax_label: string;
  tax_rate: number;
  labor_rate: number;
  timezone: string;
  opening_hours: Record<string, unknown>;
  status: GarageStatus;
  plan_id: string | null;
  trial_ends_at: string | null;
  brand: Record<string, unknown>;
  created_at: string;
}

export interface Membership {
  id: string;
  garage_id: string;
  user_id: string;
  role: MembershipRole;
  status: "active" | "invited" | "suspended";
  labor_rate: number | null;
  created_at: string;
}

export interface MembershipWithProfile extends Membership {
  profile: Profile | null;
}

export interface Customer {
  id: string;
  garage_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  portal_user_id: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  garage_id: string;
  customer_id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  vin: string | null;
  engine_number: string | null;
  color: string | null;
  transmission: string | null;
  fuel_type: string | null;
  mileage: number | null;
  notes: string | null;
  created_at: string;
}

export interface WorkOrder {
  id: string;
  garage_id: string;
  number: string;
  customer_id: string;
  vehicle_id: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  complaint: string | null;
  requested_work: string | null;
  notes: string | null;
  mileage_in: number | null;
  fuel_level_in: number | null;
  mileage_out: number | null;
  fuel_level_out: number | null;
  expected_completion: string | null;
  checked_in_by: string | null;
  checked_in_at: string;
  completed_at: string | null;
  checked_out_at: string | null;
  created_at: string;
}

export interface WorkOrderExpanded extends WorkOrder {
  customer: Customer | null;
  vehicle: Vehicle | null;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  price_annual: number;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  sort_order: number;
  active: boolean;
}

export interface AuditLog {
  id: string;
  garage_id: string | null;
  user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  garage_id: string;
  user_id: string | null;
  roles: MembershipRole[] | null;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}
