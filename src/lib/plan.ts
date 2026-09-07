import type { SubscriptionPlan } from "@/types/domain";

export interface PlanLimits {
  users?: number;
  vehicles?: number;
  storage_mb?: number;
}
export interface PlanFeatures {
  reports?: boolean;
  customer_portal?: boolean;
  inventory?: boolean;
  api?: boolean;
  sso?: boolean;
}

export function planLimits(plan: SubscriptionPlan | null | undefined): PlanLimits {
  return (plan?.limits as PlanLimits) ?? {};
}
export function planFeatures(plan: SubscriptionPlan | null | undefined): PlanFeatures {
  return (plan?.features as PlanFeatures) ?? {};
}

/** -1 = unlimited. undefined = not restricted. */
export function withinLimit(limit: number | undefined, current: number): boolean {
  if (limit == null || limit < 0) return true;
  return current < limit;
}

export function limitLabel(limit: number | undefined): string {
  if (limit == null) return "—";
  if (limit < 0) return "Unlimited";
  return limit.toLocaleString();
}
