"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export async function subscribePush(sub: PushSubscriptionInput): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: ctx.userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth_key: sub.keys.auth,
      user_agent: sub.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<{ ok: boolean }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false };
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", ctx.userId);
  return { ok: true };
}

/** Whether the current user already has any device subscribed. Drives the toggle's initial state. */
export async function hasPushSubscription(): Promise<boolean> {
  const ctx = await getSessionContext();
  if (!ctx) return false;
  const supabase = await createClient();
  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId);
  return (count ?? 0) > 0;
}
