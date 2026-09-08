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
        if (res.ok) return { ok: true };
        const detail = await res.text().catch(() => "");
        return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 300)}` };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

function twilioProvider(channel: "sms" | "whatsapp"): NotificationProvider | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_FROM;
  if (!sid || !token || !from) return null;
  return {
    name: `twilio-${channel}`,
    async send(msg) {
      try {
        const to = channel === "whatsapp" ? `whatsapp:${msg.to}` : msg.to;
        const body = new URLSearchParams({ To: to, From: from, Body: msg.body });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        return res.ok ? { ok: true } : { ok: false, error: `twilio ${res.status}` };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

function providerFor(channel: Channel): NotificationProvider {
  if (channel === "email") return resendProvider() ?? mockProvider;
  if (channel === "sms") return twilioProvider("sms") ?? mockProvider;
  if (channel === "whatsapp") return twilioProvider("whatsapp") ?? mockProvider;
  return mockProvider;
}

/** Send one message on the given channel. Returns the provider used and any error. */
export async function sendVia(
  channel: Channel,
  msg: { to: string; subject?: string; body: string },
): Promise<{ ok: boolean; provider: string; error?: string }> {
  const provider = providerFor(channel);
  if (provider.name === "mock") return { ok: false, provider: "mock", error: "no provider configured" };
  const res = await provider.send({ channel, to: msg.to, subject: msg.subject, body: msg.body });
  if (!res.ok) console.error(`[sendVia:${channel}] ${provider.name} failed:`, res.error);
  return { ok: res.ok, provider: provider.name, error: res.error };
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

/**
 * Send a one-off email through whatever email provider is configured.
 * Returns { ok:false, provider:"mock" } when nothing is set up — callers
 * should fall back to showing a link the user can send themselves.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; provider: string; error?: string }> {
  const provider = providerFor("email");
  if (provider.name === "mock") {
    console.warn("[sendEmail] no email provider configured (RESEND_API_KEY missing) — mock mode");
    return { ok: false, provider: "mock" };
  }
  const res = await provider.send({ channel: "email", to: opts.to, subject: opts.subject, body: opts.body });
  if (!res.ok) console.error(`[sendEmail] ${provider.name} failed:`, res.error);
  return { ok: res.ok, provider: provider.name, error: res.error };
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
