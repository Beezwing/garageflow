"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { checkOutVehicle } from "@/lib/actions/billing";
import { money } from "@/lib/format";
import { Card, CardBody, Field, Input, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SignaturePad } from "@/components/checkin/SignaturePad";
import { useToast } from "@/components/ui/Toast";

const CHECKS = [
  "Repairs completed",
  "Technician checklist completed",
  "Quality inspection completed",
  "Approved additional work completed",
  "Invoice settled",
  "Customer belongings checked",
  "Keys ready",
  "Customer identified",
];

export function CheckoutForm({
  workOrderId,
  balance,
  currency,
  qualityPassed,
  canOverride,
  customerName,
}: {
  workOrderId: string;
  balance: number;
  currency: string;
  qualityPassed: boolean;
  canOverride: boolean;
  customerName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({
    "Invoice settled": balance <= 0,
    "Quality inspection completed": qualityPassed,
  });
  const [form, setForm] = React.useState({
    collected_by_name: customerName,
    relationship: "Owner",
    id_verified: false,
    final_mileage: "",
    notes: "",
  });
  const [sig, setSig] = React.useState<string | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");

  const needsOverride = balance > 0;
  const ready =
    form.collected_by_name.trim() &&
    form.id_verified &&
    CHECKS.filter((c) => c !== "Invoice settled").every((c) => checked[c]) &&
    (!needsOverride || overrideReason.trim().length > 3);

  async function submit() {
    setPending(true);
    try {
      await checkOutVehicle({
        work_order_id: workOrderId,
        collected_by_name: form.collected_by_name,
        relationship: form.relationship,
        id_verified: form.id_verified,
        final_mileage: form.final_mileage ? Number(form.final_mileage) : undefined,
        notes: form.notes || undefined,
        checklist: CHECKS.map((c) => ({ item: c, checked: !!checked[c] })),
        customer_signature: sig ?? undefined,
        override_reason: needsOverride ? overrideReason : undefined,
      });
      toast.push("Vehicle released", "success");
      router.push(`/workshop/jobs/${workOrderId}`);
    } catch (e) {
      toast.push((e as Error).message, "error");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="space-y-1.5">
          {CHECKS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={!!checked[c]}
                onChange={(e) => setChecked({ ...checked, [c]: e.target.checked })}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              {c}
              {c === "Invoice settled" && balance > 0 ? (
                <span className="text-xs text-[var(--tone-amber-fg)]">({money(balance, currency)} due)</span>
              ) : null}
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Person collecting">
            <Input
              value={form.collected_by_name}
              onChange={(e) => setForm({ ...form, collected_by_name: e.target.value })}
            />
          </Field>
          <Field label="Relationship to customer">
            <Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          </Field>
          <Field label="Final mileage (km)">
            <Input
              type="number"
              value={form.final_mileage}
              onChange={(e) => setForm({ ...form, final_mileage: e.target.value })}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={form.id_verified}
            onChange={(e) => setForm({ ...form, id_verified: e.target.checked })}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          I verified the collector&apos;s ID
        </label>

        <SignaturePad label="Customer signature" value={sig} onChange={setSig} />

        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </Field>

        {needsOverride ? (
          canOverride ? (
            <Field label="Checkout override reason" hint="Required — audit-logged.">
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                placeholder="e.g. approved credit arrangement, balance to be settled by Friday"
              />
            </Field>
          ) : (
            <p className="rounded-[var(--radius)] bg-[var(--tone-red-bg)] px-3 py-2 text-sm text-[var(--tone-red-fg)]">
              This job has an outstanding balance. A garage admin or supervisor must perform the checkout
              override.
            </p>
          )
        ) : null}

        <Button className="w-full" disabled={!ready || pending} onClick={submit}>
          {pending ? "Releasing…" : needsOverride ? "Override & release vehicle" : "Release vehicle"}
        </Button>
      </CardBody>
    </Card>
  );
}
