"use client";

import * as React from "react";
import { startDimePayCheckout } from "@/lib/actions/dimepay-checkout";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function PayWithDimePay({ invoiceId }: { invoiceId: string }) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  async function start() {
    setPending(true);
    const res = await startDimePayCheckout(invoiceId);
    setPending(false);
    if (!res.ok || !res.orderUrl) {
      toast.push(res.error || "Couldn't start DimePay checkout.", "error");
      return;
    }
    window.open(res.orderUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-3">
      <p className="mb-2 text-sm text-text-muted">
        Send the customer to pay online — the balance updates itself the moment DimePay confirms it.
      </p>
      <Button size="sm" className="w-full" disabled={pending} onClick={start}>
        {pending ? "Starting…" : "Pay with DimePay"}
      </Button>
    </div>
  );
}
