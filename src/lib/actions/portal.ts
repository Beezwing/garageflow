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

export interface AppointmentRequestInput {
  booking_slug: string;
  contact_name: string;
  contact_phone?: string;
  make?: string;
  model?: string;
  year?: string;
  license_plate?: string;
  title?: string;
  preferred_at: string; // ISO
  duration_min?: number;
  customer_note?: string;
  photo_paths?: string[];
}

export async function requestAppointment(input: AppointmentRequestInput): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in first.");

  const { data, error } = await supabase.rpc("portal_request_appointment", {
    payload: {
      booking_slug: input.booking_slug,
      contact_name: input.contact_name,
      contact_phone: input.contact_phone ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      year: input.year ?? null,
      license_plate: input.license_plate ?? null,
      title: input.title ?? null,
      preferred_at: input.preferred_at,
      duration_min: input.duration_min ?? 60,
      customer_note: input.customer_note ?? null,
      photo_urls: input.photo_paths ?? [],
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/portal/appointments");
  revalidatePath("/portal", "layout");
  return data as string;
}

export async function respondToAppointment(
  appointmentId: string,
  decision: "accept" | "decline",
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_respond_appointment", {
    payload: { appointment_id: appointmentId, decision },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/portal/appointments");
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
