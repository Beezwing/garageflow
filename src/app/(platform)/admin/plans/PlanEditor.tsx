"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { savePlan } from "@/lib/actions/platform";
import { planLimits, planFeatures } from "@/lib/plan";
import type { SubscriptionPlan } from "@/types/domain";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function PlanEditor({ plan }: { plan?: SubscriptionPlan }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const lim = planLimits(plan);
  const feat = planFeatures(plan);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await savePlan(new FormData(e.currentTarget));
      toast.push("Plan saved", "success");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.push((err as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-brand hover:underline">
        {plan ? "Edit" : "New plan"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={plan ? `Edit ${plan.name}` : "New plan"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="plan-form" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="plan-form" onSubmit={onSubmit} className="space-y-3">
          {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code">
              <Input name="code" defaultValue={plan?.code ?? ""} required placeholder="pro" />
            </Field>
            <Field label="Name">
              <Input name="name" defaultValue={plan?.name ?? ""} required />
            </Field>
            <Field label="Price / month">
              <Input name="price_monthly" type="number" defaultValue={plan?.price_monthly ?? 0} />
            </Field>
            <Field label="Price / year">
              <Input name="price_annual" type="number" defaultValue={plan?.price_annual ?? 0} />
            </Field>
          </div>
          <p className="text-xs text-text-subtle">Limits — use -1 for unlimited.</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Staff">
              <Input name="limit_users" type="number" defaultValue={lim.users ?? -1} />
            </Field>
            <Field label="Vehicles">
              <Input name="limit_vehicles" type="number" defaultValue={lim.vehicles ?? -1} />
            </Field>
            <Field label="Storage MB">
              <Input name="limit_storage" type="number" defaultValue={lim.storage_mb ?? -1} />
            </Field>
          </div>
          <div className="space-y-1">
            {(
              [
                ["f_reports", "reports", "Reports"],
                ["f_portal", "customer_portal", "Customer portal"],
                ["f_inventory", "inventory", "Inventory"],
                ["f_api", "api", "API access"],
                ["f_sso", "sso", "SSO"],
              ] as const
            ).map(([name, key, label]) => (
              <label key={name} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={Boolean((feat as Record<string, boolean>)[key])}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort order">
              <Input name="sort_order" type="number" defaultValue={plan?.sort_order ?? 0} />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm text-text">
              <input
                type="checkbox"
                name="active"
                value="true"
                defaultChecked={plan?.active ?? true}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Active
            </label>
          </div>
        </form>
      </Modal>
    </>
  );
}
