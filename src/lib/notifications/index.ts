import { createClient } from "@/lib/supabase/server";

/**
 * Provider-agnostic customer notifications. Every send is queued as a
 * `customer_messages` row (audit + retry), then handed to whatever provider is
 * configured via env. With nothing configured it runs in "mock" mode — the row
 * is marked `mock` and nothing leaves the building. Swap providers by
 * implementing the interface below; call sites never change.
 */
export type Channel = "email" | "sms" | "whatsapp";

export type CustomerEvent =
  | "checked_in"
  | "repair_started"
  | "additional_work"
  | "repair_completed"
  | "invoice_ready"
  | "payment_received"
  | "ready_for_pickup";

interface OutboundMessage {
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
}

interface NotificationProvider {
  name: string;
  send(msg: OutboundMessage): Promise<{ ok: boolean; error?: string }>;
}

const mockProvider: NotificationProvider = {
  name: "mock",
  async send() {
    return { ok: true };
  },
};

function resendProvider(): NotificationProvider | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return {
    name: "resend",
    async send(msg) {
      if (msg.channel !== "email") return { ok: false, error: "resend: email only" };
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.RESEND_FROM ?? "GarageFlow <notifications@garageflow.app>",
            to: msg.to,
            subject: msg.subject ?? "Update from your garage",
            text: msg.body,
          }),
        });
        return res.ok ? { ok: true } : { ok: false, error: `resend ${res.status}` };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

function providerFor(channel: Channel): NotificationProvider {
  if (channel === "email") return resendProvider() ?? mockProvider;
  // SMS / WhatsApp providers (Twilio, etc.) plug in here
  return mockProvider;
}

const TEMPLATES: Record<CustomerEvent, (ctx: TemplateCtx) => { subject: string; body: string }> = {
  checked_in: (c) => ({
    subject: `We've received your ${c.vehicle}`,
    body: `Hi ${c.name}, we've checked in your ${c.vehicle} (job ${c.jobNumber}). We'll keep you posted. — ${c.garage}`,
  }),
  repair_started: (c) => ({
    subject: `Work has started on your ${c.vehicle}`,
    body: `Hi ${c.name}, a technician has started work on your ${c.vehicle} (job ${c.jobNumber}). — ${c.garage}`,
  }),
  additional_work: (c) => ({
    subject: `Approval needed for your ${c.vehicle}`,
    body: `Hi ${c.name}, we found something that needs your approval on job ${c.jobNumber}. ${c.detail ?? ""} — ${c.garage}`,
  }),
  repair_completed: (c) => ({
    subject: `Repairs finished on your ${c.vehicle}`,
    body: `Hi ${c.name}, repairs on your ${c.vehicle} (job ${c.jobNumber}) are complete. We'll let you know when it's ready to collect. — ${c.garage}`,
  }),
  invoice_ready: (c) => ({
    subject: `Your invoice is ready`,
    body: `Hi ${c.name}, the invoice for job ${c.jobNumber} is ready. ${c.detail ?? ""} — ${c.garage}`,
  }),
  payment_received: (c) => ({
    subject: `Payment received`,
    body: `Hi ${c.name}, we've received your payment for job ${c.jobNumber}. Thank you! — ${c.garage}`,
  }),
  ready_for_pickup: (c) => ({
    subject: `Your ${c.vehicle} is ready for pickup`,
    body: `Hi ${c.name}, your ${c.vehicle} (job ${c.jobNumber}) is ready to collect. — ${c.garage}`,
  }),
};

interface TemplateCtx {
  name: string;
  vehicle: string;
  jobNumber: string;
  garage: string;
  detail?: string;
}

export async function notifyCustomer(opts: {
  garageId: string;
  customerId: string | null;
  workOrderId: string | null;
  event: CustomerEvent;
  channel?: Channel;
  template: TemplateCtx;
  to?: string;
}): Promise<void> {
  const supabase = await createClient();
  const channel: Channel = opts.channel ?? "email";
  const { subject, body } = TEMPLATES[opts.event](opts.template);

  const { data: row } = await supabase
    .from("customer_messages")
    .insert({
      garage_id: opts.garageId,
      customer_id: opts.customerId,
      work_order_id: opts.workOrderId,
      channel,
      template: opts.event,
      payload: { subject, body },
      status: "queued",
    })
    .select("id")
    .single();

  const provider = providerFor(channel);
  let status = "mock";
  let error: string | null = null;

  if (provider.name !== "mock" && opts.to) {
    const res = await provider.send({ channel, to: opts.to, subject, body });
    status = res.ok ? "sent" : "failed";
    error = res.error ?? null;
  }

  if (row) {
    await supabase
      .from("customer_messages")
      .update({ status, provider: provider.name, error, sent_at: new Date().toISOString() })
      .eq("id", row.id);
  }
}
