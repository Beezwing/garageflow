import { createClient } from "@/lib/supabase/server";
import { planLimits } from "@/lib/plan";
import type { SubscriptionPlan } from "@/types/domain";

/**
 * Throws if adding one more `kind` would exceed the garage's plan limit.
 * `kind`: "users" | "vehicles". A limit of -1 (or missing) means unlimited.
 */
export async function assertWithinPlan(garageId: string, kind: "users" | "vehicles"): Promise<void> {
  const supabase = await createClient();

  const { data: garage } = await supabase
    .from("garages")
    .select("plan_id, status")
    .eq("id", garageId)
    .maybeSingle();

  if (garage?.status === "suspended" || garage?.status === "cancelled") {
    throw new Error("This garage is suspended. Contact GarageFlow to reactivate.");
  }
  if (!garage?.plan_id) return;

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("id", garage.plan_id)
    .maybeSingle();

  const limit = planLimits(plan as SubscriptionPlan)[kind];
  if (limit == null || limit < 0) return;

  const { count } =
    kind === "users"
      ? await supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("garage_id", garageId)
          .neq("status", "suspended")
      : await supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("garage_id", garageId)
          .is("deleted_at", null);

  if ((count ?? 0) >= limit) {
    const label = kind === "users" ? "staff accounts" : "vehicles";
    throw new Error(
      `Your plan allows ${limit} ${label} and you're at the limit. Upgrade in Settings → Subscription.`,
    );
  }
}
