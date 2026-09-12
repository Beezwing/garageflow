"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";

export interface DimePayStatus {
  connected: boolean;
  enabled: boolean;
  sandbox: boolean;
  clientKeyMasked: string | null;
}

/** Never returns the raw signing secret to the client — read-only status only. */
export async function getDimePayStatus(): Promise<DimePayStatus> {
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("garage_payment_providers")
    .select("enabled, sandbox, credentials")
    .eq("garage_id", ctx.garage.id)
    .eq("provider", "dimepay")
    .maybeSingle();

  if (!data) return { connected: false, enabled: false, sandbox: true, clientKeyMasked: null };
  const key = (data.credentials as { client_key?: string })?.client_key ?? "";
  const masked = key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : null;
  return { connected: true, enabled: data.enabled as boolean, sandbox: data.sandbox as boolean, clientKeyMasked: masked };
}

export async function saveDimePayCredentials(form: {
  clientKey: string;
  signingSecret: string;
  sandbox: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "settings.manage");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!form.clientKey.trim() || !form.signingSecret.trim()) {
    return { ok: false, error: "Both the API key and signing secret are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("garage_payment_providers").upsert(
    {
      garage_id: ctx.garage.id,
      provider: "dimepay",
      enabled: true,
      sandbox: form.sandbox,
      credentials: { client_key: form.clientKey.trim(), signing_secret: form.signingSecret.trim() },
    },
    { onConflict: "garage_id,provider" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/payments");
  return { ok: true };
}

export async function setDimePayEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "settings.manage");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("garage_payment_providers")
    .update({ enabled })
    .eq("garage_id", ctx.garage.id)
    .eq("provider", "dimepay");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/payments");
  return { ok: true };
}

export async function disconnectDimePay(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "settings.manage");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("garage_payment_providers")
    .delete()
    .eq("garage_id", ctx.garage.id)
    .eq("provider", "dimepay");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/payments");
  return { ok: true };
}
