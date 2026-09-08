"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { updateGarageSettings, updateOperationalSettings, updateBookingSettings } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/types";
import type { Garage } from "@/types/domain";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

const initial: ActionState = {};
const ALL_METHODS = [
  ["cash", "Cash"],
  ["card", "Card"],
  ["bank_transfer", "Bank transfer"],
  ["online", "Online payment"],
] as const;

export function BusinessSettingsForm({
  garage,
  paymentMethods,
  allowNegativeStock,
}: {
  garage: Garage & { booking_slug?: string | null; accepts_online_booking?: boolean };
  paymentMethods: string[];
  allowNegativeStock: boolean;
}) {
  const toast = useToast();
  const [bizState, bizAction, bizPending] = useActionState(updateGarageSettings, initial);
  const [opState, opAction, opPending] = useActionState(updateOperationalSettings, initial);
  const [bkState, bkAction, bkPending] = useActionState(updateBookingSettings, initial);

  const slug = garage.booking_slug ?? garage.slug;
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (bizState.ok) toast.push("Business details saved", "success");
    if (bizState.error) toast.push(bizState.error, "error");
  }, [bizState, toast]);
  useEffect(() => {
    if (opState.ok) toast.push("Operational settings saved", "success");
    if (opState.error) toast.push(opState.error, "error");
  }, [opState, toast]);
  useEffect(() => {
    if (bkState.ok) toast.push("Booking settings saved", "success");
    if (bkState.error) toast.push(bkState.error, "error");
  }, [bkState, toast]);

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={bizAction} className="space-y-4">
            <Field label="Garage name">
              <Input name="name" defaultValue={garage.name} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <Input name="phone" defaultValue={garage.phone ?? ""} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" defaultValue={garage.email ?? ""} />
              </Field>
            </div>
            <Field label="Address">
              <Input name="address" defaultValue={garage.address ?? ""} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tax / GCT number">
                <Input name="tax_number" defaultValue={garage.tax_number ?? ""} />
              </Field>
              <Field label="Business registration">
                <Input name="business_reg" defaultValue={garage.business_reg ?? ""} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Currency">
                <Select name="currency" defaultValue={garage.currency}>
                  {["JMD", "USD", "TTD", "BBD", "XCD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tax label">
                <Input name="tax_label" defaultValue={garage.tax_label} />
              </Field>
              <Field label="Tax rate" hint="e.g. 0.15 = 15%">
                <Input name="tax_rate" type="number" step="0.001" min="0" max="1" defaultValue={garage.tax_rate} />
              </Field>
            </div>
            <Field label="Default labour rate (per hour)">
              <Input name="labor_rate" type="number" min="0" step="1" defaultValue={garage.labor_rate} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={bizPending}>
                {bizPending ? "Saving…" : "Save business details"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Online booking</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-text-muted">
            Share this link so customers can request an appointment and send photos of their vehicle. Every
            request lands on your Appointments page for you to confirm or reschedule.
          </p>
          <form action={bkAction} className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                name="accepts_online_booking"
                defaultChecked={garage.accepts_online_booking ?? true}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Accept online appointment requests
            </label>
            <Field label="Booking link name" hint="Lowercase letters, numbers and dashes.">
              <div className="flex items-center gap-1">
                <span className="whitespace-nowrap text-sm text-text-subtle">{origin || "…"}/book/</span>
                <Input name="booking_slug" defaultValue={slug} className="flex-1" />
              </div>
            </Field>
            {origin ? (
              <p className="text-xs text-text-muted">
                Current link:{" "}
                <a href={`${origin}/book/${slug}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  {origin}/book/{slug}
                </a>
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={bkPending}>
                {bkPending ? "Saving…" : "Save booking settings"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={opAction} className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-text">Accepted payment methods</p>
              <div className="flex flex-wrap gap-3">
                {ALL_METHODS.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      name="payment_methods"
                      value={value}
                      defaultChecked={paymentMethods.includes(value)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                name="allow_negative_stock"
                defaultChecked={allowNegativeStock}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Allow parts to go below zero stock (not recommended)
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={opPending}>
                {opPending ? "Saving…" : "Save operations"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
