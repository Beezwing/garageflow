"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function claimPortalAccess(): Promise<{ linked: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_portal_access");
  if (error) throw new Error(error.message);
  const linked = (data as number) ?? 0;
  if (linked > 0) {
    revalidatePath("/portal", "layout");
    redirect("/portal");
  }
  return { linked };
}

export async function respondAdditionalWork(
  workOrderId: string,
  form: { request_id: string; decision: "approved" | "declined"; notes?: string; customer_signature?: string },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_respond_additional_work", {
    payload: {
      request_id: form.request_id,
      decision: form.decision,
      notes: form.notes ?? null,
      customer_signature: form.customer_signature ?? null,
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/portal/jobs/${workOrderId}`);
  revalidatePath("/portal");
}
