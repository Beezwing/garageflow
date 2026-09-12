"use server";

import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { createHostedCheckout, type DimePayCredentials } from "@/lib/payments/dimepay";

export interface StartCheckoutResult {
  ok: boolean;
  orderUrl?: string;
  error?: string;
}

/** Starts a DimePay hosted checkout for an invoice's outstanding balance. */
export async function startDimePayCheckout(invoiceId: string): Promise<StartCheckoutResult> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "payment.record");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = await createClient();

  const [{ data: provider }, { data: invoice }] = await Promise.all([
    supabase
      .from("garage_payment_providers")
      .select("enabled, sandbox, credentials")
      .eq("garage_id", ctx.garage.id)
      .eq("provider", "dimepay")
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("id, number, balance, currency, status, customer:customers(email)")
      .eq("id", invoiceId)
      .eq("garage_id", ctx.garage.id)
      .maybeSingle(),
  ]);

  if (!provider || !provider.enabled) return { ok: false, error: "DimePay isn't connected for this garage yet." };
  if (!invoice) return { ok: false, error: "Invoice not found." };
  const balance = Number(invoice.balance);
  if (!(balance > 0)) return { ok: false, error: "This invoice has nothing outstanding." };

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const customer = invoice.customer as unknown as { email: string | null } | null;

  const { data: checkout, error: insertErr } = await supabase
    .from("dimepay_checkouts")
    .insert({
      garage_id: ctx.garage.id,
      invoice_id: invoiceId,
      amount: balance,
      currency: (invoice.currency as string) || "JMD",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !checkout) return { ok: false, error: insertErr?.message || "Couldn't start the checkout." };

  const result = await createHostedCheckout({
    credentials: provider.credentials as DimePayCredentials,
    sandbox: provider.sandbox as boolean,
    amount: balance,
    currency: (invoice.currency as string) || "JMD",
    reference: checkout.id as string,
    email: customer?.email ?? null,
    description: `Invoice ${invoice.number}`,
    webhookUrl: `${base}/api/webhooks/dimepay?ref=${checkout.id}`,
    redirectUrl: `${base}/billing/invoices/${invoiceId}?dimepay=return`,
  });

  if (!result.ok) {
    await supabase.from("dimepay_checkouts").update({ status: "failed" }).eq("id", checkout.id as string);
    return { ok: false, error: result.error };
  }

  await supabase.from("dimepay_checkouts").update({ order_url: result.orderUrl }).eq("id", checkout.id as string);
  return { ok: true, orderUrl: result.orderUrl };
}
