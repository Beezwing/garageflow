"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  issueInvoice,
  addInvoiceItem,
  removeInvoiceItem,
  recordPayment,
  cancelInvoice,
} from "@/lib/actions/billing";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setPending(true);
      try {
        await fn();
        if (ok) toast.push(ok, "success");
        router.refresh();
      } catch (e) {
        toast.push((e as Error).message, "error");
      }
      setPending(false);
    },
    [router, toast],
  );
  return { run, pending };
}

export function RemoveItem({ invoiceId, itemId }: { invoiceId: string; itemId: string }) {
  const { run, pending } = useRun();
  return (
    <button
      disabled={pending}
      onClick={() => run(() => removeInvoiceItem(invoiceId, itemId))}
      className="text-xs text-[var(--tone-red-fg)] hover:underline"
    >
      remove
    </button>
  );
}

export function AddItem({ invoiceId }: { invoiceId: string }) {
  const { run, pending } = useRun();
  const [f, setF] = React.useState({ kind: "other", description: "", quantity: "1", unit_price: "" });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <select
        value={f.kind}
        onChange={(e) => setF({ ...f, kind: e.target.value })}
        className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm sm:w-auto"
      >
        {["other", "discount"].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <input
        placeholder="Description"
        value={f.description}
        onChange={(e) => setF({ ...f, description: e.target.value })}
        className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm sm:min-w-[8rem] sm:flex-1"
      />
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Qty"
          value={f.quantity}
          onChange={(e) => setF({ ...f, quantity: e.target.value })}
          className="w-16 rounded border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          placeholder="Unit"
          value={f.unit_price}
          onChange={(e) => setF({ ...f, unit_price: e.target.value })}
          className="w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </div>
      <Button
        size="sm"
        className="max-sm:w-full"
        disabled={pending || !f.description.trim()}
        onClick={() =>
          run(
            () =>
              addInvoiceItem(invoiceId, {
                kind: f.kind,
                description: f.description,
                quantity: Number(f.quantity) || 1,
                unit_price: Number(f.unit_price) || 0,
              }),
            "Line added",
          ).then(() => setF({ kind: "other", description: "", quantity: "1", unit_price: "" }))
        }
      >
        Add line
      </Button>
    </div>
  );
}

export function RecordPayment({
  invoiceId,
  balance,
  methods,
}: {
  invoiceId: string;
  balance: number;
  methods: string[];
}) {
  const { run, pending } = useRun();
  const [f, setF] = React.useState({ amount: String(balance > 0 ? balance : ""), method: methods[0], reference: "" });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Amount"
          value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })}
          className="w-28 flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm sm:flex-none"
        />
        <select
          value={f.method}
          onChange={(e) => setF({ ...f, method: e.target.value })}
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {m.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <input
        placeholder="Reference"
        value={f.reference}
        onChange={(e) => setF({ ...f, reference: e.target.value })}
        className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm sm:w-32"
      />
      <Button
        size="sm"
        className="max-sm:w-full"
        disabled={pending || !(Number(f.amount) > 0)}
        onClick={() =>
          run(
            () =>
              recordPayment(invoiceId, {
                amount: Number(f.amount),
                method: f.method,
                reference: f.reference || undefined,
              }),
            "Payment recorded",
          )
        }
      >
        Record payment
      </Button>
    </div>
  );
}

export function StatusControls({
  invoiceId,
  status,
  workOrderId,
}: {
  invoiceId: string;
  status: string;
  workOrderId: string | null;
}) {
  const { run, pending } = useRun();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {status === "draft" ? (
          <Button size="sm" className="w-full" disabled={pending} onClick={() => run(() => issueInvoice(invoiceId), "Invoice issued")}>
            Issue invoice
          </Button>
        ) : null}
        {["draft", "unpaid", "partial"].includes(status) ? (
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => cancelInvoice(invoiceId), "Invoice cancelled")}
          >
            Cancel invoice
          </Button>
        ) : null}
        {workOrderId ? (
          <a href={`/workshop/jobs/${workOrderId}`} className="block text-center text-sm text-brand hover:underline">
            Back to work order
          </a>
        ) : null}
        <a href={`/print/invoice/${invoiceId}`} target="_blank" rel="noreferrer" className="block text-center text-sm text-brand hover:underline">
          Print / PDF
        </a>
      </CardBody>
    </Card>
  );
}

