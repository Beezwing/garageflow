import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { sendVia, type Channel } from "@/lib/notifications";
import { dateTime } from "@/lib/format";

const MAX_ATTEMPTS = 5;

interface QueueRow {
  id: string;
  garage_id: string;
  customer_id: string | null;
  channel: string;
  template: string;
  payload: Record<string, unknown> | null;
  status: string;
  attempts: number;
}

/** Build subject/body for rows that don't already carry them (the SQL-written ones). */
function render(
  template: string,
  payload: Record<string, unknown>,
  ctx: { name: string; garage: string },
): { subject: string; body: string } | null {
  if (typeof payload.subject === "string" && typeof payload.body === "string") {
    return { subject: payload.subject, body: payload.body };
  }
  const when = payload.when ? dateTime(String(payload.when)) : "";
  switch (template) {
    case "appointment_confirmed":
      return {
        subject: `Your appointment with ${ctx.garage} is confirmed`,
        body: `Hi ${ctx.name}, ${ctx.garage} has confirmed your appointment for ${when}. See you then.`,
      };
    case "appointment_reschedule":
      return {
        subject: `${ctx.garage} suggested a new appointment time`,
        body: `Hi ${ctx.name}, ${ctx.garage} has proposed ${when} for your appointment. Sign in to your account to accept or decline.`,
      };
    default:
      return null;
  }
}

export interface DrainResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Send pending customer_messages. Safe to call concurrently-ish for a pilot —
 * rows are re-read each pass and `sent` rows are never picked up again.
 */
export async function drainMessageQueue(limit = 25): Promise<DrainResult> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("customer_messages")
    .select("id, garage_id, customer_id, channel, template, payload, status, attempts")
    .or(`status.eq.queued,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
    .order("created_at", { ascending: true })
    .limit(limit);

  const queue = (rows ?? []) as QueueRow[];
  if (queue.length === 0) return { processed: 0, sent: 0, failed: 0, skipped: 0 };

  // batch-load the customers and garages we need
  const customerIds = [...new Set(queue.map((r) => r.customer_id).filter(Boolean) as string[])];
  const garageIds = [...new Set(queue.map((r) => r.garage_id))];

  const [{ data: customers }, { data: garages }] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name, email, phone").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string | null; phone: string | null }[] }),
    supabase.from("garages").select("id, name").in("id", garageIds),
  ]);

  const custById = new Map((customers ?? []).map((c) => [c.id as string, c]));
  const garageById = new Map((garages ?? []).map((g) => [g.id as string, g.name as string]));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of queue) {
    const cust = row.customer_id ? custById.get(row.customer_id) : null;
    const garage = garageById.get(row.garage_id) ?? "your garage";
    const channel = (["email", "sms", "whatsapp"].includes(row.channel) ? row.channel : "email") as Channel;
    const to = channel === "email" ? cust?.email ?? null : cust?.phone ?? null;

    const stampFail = async (error: string) => {
      failed++;
      await supabase
        .from("customer_messages")
        .update({ status: "failed", error, attempts: row.attempts + 1, last_attempt_at: new Date().toISOString() })
        .eq("id", row.id);
    };

    if (!to) {
      await stampFail(`no ${channel} address on file`);
      continue;
    }

    const rendered = render(row.template, row.payload ?? {}, { name: cust?.name ?? "there", garage });
    if (!rendered) {
      await stampFail(`no template for "${row.template}"`);
      continue;
    }

    const res = await sendVia(channel, { to, subject: rendered.subject, body: rendered.body });
    if (res.ok) {
      sent++;
      await supabase
        .from("customer_messages")
        .update({
          status: "sent",
          provider: res.provider,
          error: null,
          sent_at: new Date().toISOString(),
          attempts: row.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else if (res.provider === "mock") {
      // nothing configured for this channel — leave it queued, don't burn attempts
      skipped++;
    } else {
      await stampFail(res.error ?? "send failed");
    }
  }

  return { processed: queue.length, sent, failed, skipped };
}
