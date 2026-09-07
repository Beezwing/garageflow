"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateInvoice } from "@/lib/actions/workorders";
import { money } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const TONE: Record<string, "gray" | "amber" | "green" | "red" | "blue"> = {
  draft: "gray",
  unpaid: "amber",
  partial: "amber",
  paid: "green",
  cancelled: "red",
  refunded: "blue",
};

export function InvoicePanel({
  woId,
  currency,
  invoices,
  canManage,
}: {
  woId: string;
  currency: string;
  invoices: { id: string; number: string; status: string; total: number; balance: number }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  async function generate() {
    setPending(true);
    try {
      const invId = await generateInvoice(woId);
      toast.push("Invoice generated", "success");
      router.push(`/billing/invoices/${invId}`);
    } catch (e) {
      toast.push((e as Error).message, "error");
      setPending(false);
    }
  }

  return (
    <Card data-tour="invoice-panel">
      <CardHeader>
        <CardTitle>Invoice</CardTitle>
        <span className="text-xs text-text-subtle">updates live</span>
      </CardHeader>
      <CardBody className="space-y-2">
        {invoices.length === 0 ? (
          <p className="text-sm text-text-muted">
            The invoice builds automatically from parts, labour and services on this job.
          </p>
        ) : (
          invoices.map((i) => (
            <Link
              key={i.id}
              href={`/billing/invoices/${i.id}`}
              className="flex items-center justify-between rounded bg-surface-2 px-2.5 py-2 text-sm hover:bg-border"
            >
              <span className="font-medium text-brand">{i.number}</span>
              <span className="flex items-center gap-2">
                <span className="text-text">{money(i.total, currency)}</span>
                <Badge tone={TONE[i.status] ?? "gray"}>{i.status}</Badge>
              </span>
            </Link>
          ))
        )}
        {canManage ? (
          <Button size="sm" variant="secondary" className="w-full" disabled={pending} onClick={generate}>
            {invoices.length === 0 ? "Create invoice now" : "Re-sync from job"}
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}
