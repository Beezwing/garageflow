import "server-only";
import jwt from "jsonwebtoken";

/**
 * DimePay hosted-checkout integration.
 *
 * Docs: https://docs.dimepay.net/ — the hosted-page endpoint takes a signed
 * JWT (HS256, signed with the merchant's own signing secret) carrying the
 * order details, plus a `webhookUrl` DimePay calls back on completion. The
 * exact webhook payload isn't published, so `verifyAndParseWebhook` below is
 * intentionally defensive rather than assuming one exact shape — this needs
 * a real DimePay sandbox account to fully prove out; treat it as a solid
 * first pass, not a guarantee, until someone's tested a real payment through it.
 */

const PROD_BASE = "https://api.dimepay.app/dapi/v1";
const SANDBOX_BASE = "https://sandbox.api.dimepay.app/dapi/v1";

export interface DimePayCredentials {
  client_key: string;
  signing_secret: string;
}

export interface CreateCheckoutInput {
  credentials: DimePayCredentials;
  sandbox: boolean;
  amount: number;
  currency: string;
  reference: string; // our dimepay_checkouts.id — echoed back via webhookUrl query string
  email?: string | null;
  description?: string;
  webhookUrl: string;
  redirectUrl: string;
}

export interface CreateCheckoutResult {
  ok: boolean;
  orderUrl?: string;
  error?: string;
}

export async function createHostedCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const base = input.sandbox ? SANDBOX_BASE : PROD_BASE;

  const payload = {
    id: input.reference,
    total: input.amount,
    currency: input.currency,
    email: input.email || undefined,
    webhookUrl: input.webhookUrl,
    redirectUrl: input.redirectUrl,
    checkoutUrl: input.redirectUrl,
    items: input.description ? [{ name: input.description, price: input.amount, quantity: 1 }] : undefined,
  };

  let signed: string;
  try {
    signed = jwt.sign(payload, input.credentials.signing_secret, { algorithm: "HS256", expiresIn: "30m" });
  } catch {
    return { ok: false, error: "Couldn't sign the DimePay request — check the signing secret." };
  }

  try {
    const res = await fetch(`${base}/payments/hosted-page`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        client_key: input.credentials.client_key,
      },
      body: JSON.stringify({ lang: "en", data: signed }),
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    if (!res.ok) {
      let msg = "";
      if (body && typeof body === "object" && "message" in body) {
        msg = String((body as { message: unknown }).message);
      }
      if (!msg) msg = text.slice(0, 200) || `DimePay returned ${res.status}`;
      return { ok: false, error: msg };
    }

    const orderUrl =
      body && typeof body === "object" && "order_url" in body
        ? String((body as { order_url: unknown }).order_url)
        : undefined;

    if (!orderUrl) return { ok: false, error: "DimePay didn't return a checkout link." };
    return { ok: true, orderUrl };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Couldn't reach DimePay." };
  }
}

/**
 * Best-effort read of a webhook body: DimePay's exact payload shape isn't
 * published, so this looks for the fields their docs do mention (an `id`
 * matching what we sent, and a `status`) under a few plausible shapes rather
 * than assuming one exact structure.
 */
export function parseWebhookStatus(body: unknown): { reference: string | null; paid: boolean } {
  if (!body || typeof body !== "object") return { reference: null, paid: false };
  const obj = body as Record<string, unknown>;
  const nested = (obj.data ?? obj.order ?? obj.payment ?? obj) as Record<string, unknown>;

  const reference =
    (typeof nested.id === "string" && nested.id) ||
    (typeof nested.reference === "string" && nested.reference) ||
    (typeof obj.id === "string" && obj.id) ||
    null;

  const status = String(nested.status ?? obj.status ?? "").toUpperCase();
  const paid = ["COMPLETE", "COMPLETED", "PAID", "SUCCESS", "SUCCESSFUL", "APPROVED"].includes(status);

  return { reference, paid };
}
