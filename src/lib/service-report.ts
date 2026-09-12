import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/push";
import { dateTime } from "@/lib/format";

/**
 * Sends the end-of-service report: an email to the customer (if they have
 * one on file) and a push notification (if they've linked + enabled it),
 * summarising the visit — what was reported, what was done, and anything
 * the technician wants them to know going forward. Fires right after
 * checkout; best-effort, never throws (a report failing to send shouldn't
 * block releasing the vehicle).
 */
export async function sendServiceReport(workOrderId: string): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data: wo } = await supabase
      .from("work_orders")
      .select(
        "number, complaint, requested_work, checked_in_at, checked_out_at, garage_id, customer_id, vehicle:vehicles(make, model, year, license_plate)",
      )
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo) return;

    const [{ data: garage }, { data: customer }, { data: tasks }, { data: checkout }] = await Promise.all([
      supabase.from("garages").select("name, timezone").eq("id", wo.garage_id as string).maybeSingle(),
      supabase
        .from("customers")
        .select("name, email, portal_user_id")
        .eq("id", wo.customer_id as string)
        .maybeSingle(),
      supabase
        .from("work_order_tasks")
        .select("title, status")
        .eq("work_order_id", workOrderId)
        .order("sequence"),
      supabase
        .from("checkouts")
        .select("customer_notes")
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!customer) return;

    const v = wo.vehicle as unknown as { make: string; model: string; year: number; license_plate: string } | null;
    const vehicleLine = v ? `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() + (v.license_plate ? ` · ${v.license_plate}` : "") : "your vehicle";
    const done = (tasks ?? []).filter((t) => t.status === "completed").map((t) => t.title as string);
    const outstanding = (tasks ?? []).filter((t) => t.status !== "completed").map((t) => t.title as string);
    const recommendations = (checkout?.customer_notes as string | null)?.trim() || null;
    const garageName = (garage?.name as string) ?? "the garage";
    const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/portal/jobs/${workOrderId}`;

    const lines = [
      `Hi ${customer.name ?? "there"},`,
      "",
      `Here's a summary of the work ${garageName} did on your visit.`,
      "",
      `Job: ${wo.number}`,
      `Vehicle: ${vehicleLine}`,
      `Checked in: ${wo.checked_in_at ? dateTime(wo.checked_in_at as string) : "—"}`,
      `Collected: ${wo.checked_out_at ? dateTime(wo.checked_out_at as string) : "—"}`,
      "",
      "WHAT YOU REPORTED",
      (wo.complaint as string) || (wo.requested_work as string) || "—",
      "",
      "WHAT WE DID",
      done.length ? done.map((t) => `- ${t}`).join("\n") : "—",
    ];
    if (outstanding.length) {
      lines.push("", "STILL OPEN", outstanding.map((t) => `- ${t}`).join("\n"));
    }
    if (recommendations) {
      lines.push("", "RECOMMENDATIONS FOR YOU", recommendations);
    }
    lines.push(
      "",
      `See the full record, your invoice and photos any time: ${portalUrl}`,
      "",
      `Thanks for choosing ${garageName}.`,
    );

    if (customer.email) {
      await sendEmail({
        to: customer.email as string,
        subject: `Your service report — ${wo.number}`,
        body: lines.join("\n"),
      });
    }

    if (customer.portal_user_id) {
      await sendPushToUser(customer.portal_user_id as string, {
        title: `Your service report is ready`,
        body: `${wo.number} — ${vehicleLine}`,
        url: `/portal/jobs/${workOrderId}`,
        tag: `report-${workOrderId}`,
      });
    }
  } catch (e) {
    console.error("[sendServiceReport]", e);
  }
}
