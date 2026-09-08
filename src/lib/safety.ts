import { createClient } from "@/lib/supabase/server";
import type { SafetyTip } from "@/lib/actions/safety";

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/** Active safety tips for a garage: its own plus the global library, ordered
 *  critical → warning → info, then by sort_order. */
export async function getSafetyTips(garageId: string, opts: { activeOnly?: boolean } = {}): Promise<SafetyTip[]> {
  const supabase = await createClient();
  let q = supabase
    .from("safety_tips")
    .select("id, garage_id, title, body, category, severity, active, sort_order")
    .or(`garage_id.is.null,garage_id.eq.${garageId}`);
  if (opts.activeOnly !== false) q = q.eq("active", true);

  const { data } = await q;
  return ((data ?? []) as SafetyTip[]).sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
      a.sort_order - b.sort_order ||
      a.title.localeCompare(b.title),
  );
}
