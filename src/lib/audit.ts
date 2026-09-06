import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort audit trail write from server actions. The database also writes
 * audit rows for critical RPC-driven events (checkout override, approvals,
 * payments); this covers plain CRUD done through the app layer.
 */
export async function writeAuditLog(entry: {
  garageId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      garage_id: entry.garageId,
      user_id: user?.id ?? null,
      actor_name: (user?.user_metadata?.full_name as string) ?? user?.email ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      reason: entry.reason ?? null,
    });
  } catch {
    // never block the primary operation on audit failure
  }
}
