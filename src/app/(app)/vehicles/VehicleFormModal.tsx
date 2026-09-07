"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createVehicle, updateVehicle } from "@/lib/actions/vehicles";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export interface VehicleFormValues {
  id?: string;
  customer_id?: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  license_plate?: string | null;
  vin?: string | null;
  engine_number?: string | null;
  color?: string | null;
  transmission?: string | null;
  fuel_type?: string | null;
  mileage?: number | null;
  notes?: string | null;
}

export function VehicleFormModal({
  open,
  onClose,
  initial,
  customers,
  lockCustomer,
}: {
  open: boolean;
  onClose: () => void;
  initial?: VehicleFormValues;
  customers: { id: string; name: string }[];
  lockCustomer?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const editing = Boolean(initial?.id);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = editing ? await updateVehicle({}, fd) : await createVehicle({}, fd);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    toast.push(editing ? "Vehicle updated" : "Vehicle added", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit vehicle" : "New vehicle"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="vehicle-form" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add vehicle"}
          </Button>
        </>
      }
    >
      <form id="vehicle-form" onSubmit={onSubmit} className="space-y-4">
        {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
        <Field label="Owner">
          {lockCustomer && initial?.customer_id ? (
            <>
              <input type="hidden" name="customer_id" value={initial.customer_id} />
              <Input value={customers.find((c) => c.id === initial.customer_id)?.name ?? ""} disabled />
            </>
          ) : (
            <Select name="customer_id" defaultValue={initial?.customer_id ?? ""} required>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Make">
            <Input name="make" defaultValue={initial?.make ?? ""} placeholder="Toyota" />
          </Field>
          <Field label="Model">
            <Input name="model" defaultValue={initial?.model ?? ""} placeholder="Corolla" />
          </Field>
          <Field label="Year">
            <Input name="year" type="number" defaultValue={initial?.year ?? ""} placeholder="2016" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="License plate">
            <Input name="license_plate" defaultValue={initial?.license_plate ?? ""} className="uppercase" />
          </Field>
          <Field label="VIN / chassis">
            <Input name="vin" defaultValue={initial?.vin ?? ""} className="uppercase" />
          </Field>
          <Field label="Engine number">
            <Input name="engine_number" defaultValue={initial?.engine_number ?? ""} className="uppercase" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Colour">
            <Input name="color" defaultValue={initial?.color ?? ""} />
          </Field>
          <Field label="Transmission">
            <Select name="transmission" defaultValue={initial?.transmission ?? ""}>
              <option value="">—</option>
              <option>Automatic</option>
              <option>Manual</option>
              <option>CVT</option>
            </Select>
          </Field>
          <Field label="Fuel">
            <Select name="fuel_type" defaultValue={initial?.fuel_type ?? ""}>
              <option value="">—</option>
              <option>Petrol</option>
              <option>Diesel</option>
              <option>Hybrid</option>
              <option>Electric</option>
            </Select>
          </Field>
          <Field label="Mileage (km)">
            <Input name="mileage" type="number" defaultValue={initial?.mileage ?? ""} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" defaultValue={initial?.notes ?? ""} rows={2} />
        </Field>
        {error ? <p className="text-sm text-[var(--tone-red-fg)]">{error}</p> : null}
      </form>
    </Modal>
  );
}
