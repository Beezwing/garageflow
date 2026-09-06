"use client";

import { useActionState } from "react";
import { createGarageAction } from "@/lib/actions/garage";
import type { ActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Field, Input, Select } from "@/components/ui/primitives";

const initial: ActionState = {};

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createGarageAction, initial);

  return (
    <Card>
      <CardBody>
        <form action={action} className="space-y-4">
          <Field label="Garage name">
            <Input name="name" required placeholder="e.g. Kingston Auto Care" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <Input name="phone" placeholder="876-555-0000" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" placeholder="service@garage.com" />
            </Field>
          </div>
          <Field label="Address">
            <Input name="address" placeholder="Street, city, parish" />
          </Field>
          <Field label="Currency" hint="Used for pricing and invoices. Changeable later.">
            <Select name="currency" defaultValue="JMD">
              <option value="JMD">Jamaican Dollar (JMD)</option>
              <option value="USD">US Dollar (USD)</option>
              <option value="TTD">Trinidad &amp; Tobago Dollar (TTD)</option>
              <option value="BBD">Barbadian Dollar (BBD)</option>
              <option value="XCD">East Caribbean Dollar (XCD)</option>
            </Select>
          </Field>
          {state.error ? (
            <p className="rounded-[var(--radius)] bg-[var(--tone-red-bg)] px-3 py-2 text-sm text-[var(--tone-red-fg)]">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create garage"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
