import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { parseWebhookStatus } from "@/lib/payments/dimepay";

// DimePay calls this back after a hosted-checkout payment completes. We
// identify the checkout primarily via the `ref` query param we embedded in
// the webhookUrl when starting it; the request body's own `id`/`status`
// fields (per what DimePay's docs describe) are a fallback/cross-check.
// See lib/payments/dimepay.ts for the caveat on the exact payload shape.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const ref = new URL(request.url).searchParams.get("ref");

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    /* some providers send form-encoded or empty bodies on retries/pings */
  }

  const parsed = parseWebhookStatus(body);
  const checkoutId = ref || parsed.reference;
  if (!checkoutId) {
    return NextResponse.json({ ok: false, error: "no reference" }, { status: 400 });
  }

  const { data: checkout } = await supabase
    .from("dimepay_checkouts")
    .select("id, garage_id, invoice_id, amount, status")
    .eq("id", checkoutId)
    .maybeSingle();

  if (!checkout) {
    return NextResponse.json({ ok: false, error: "unknown checkout" }, { status: 404 });
  }

  // Idempotent — a retried/duplicate webhook must never double-pay the invoice.
  if (checkout.status === "paid") {
    return NextResponse.json({ ok: true, already: true });
  }

  await supabase
    .from("dimepay_checkouts")
    .update({ raw_webhook: body as Record<string, unknown> | null })
    .eq("id", checkout.id as string);

  if (!parsed.paid) {
    return NextResponse.json({ ok: true, recorded: true, paid: false });
  }

  const { error: payErr } = await supabase.from("payments").insert({
    garage_id: checkout.garage_id,
    invoice_id: checkout.invoice_id,
    amount: checkout.amount,
    method: "online",
    reference: `DimePay ${checkout.id}`,
    notes: "Paid via DimePay hosted checkout",
    is_refund: false,
  });
  if (payErr) {
    console.error("[webhooks/dimepay] payment insert failed", payErr);
    return NextResponse.json({ ok: false, error: payErr.message }, { status: 500 });
  }

  await supabase.from("dimepay_checkouts").update({ status: "paid" }).eq("id", checkout.id as string);
  return NextResponse.json({ ok: true, paid: true });
}
