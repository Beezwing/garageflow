"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export interface CustomerFormValues {
  id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export function CustomerFormModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: CustomerFormValues;
  onSaved?: (id?: string) => void;
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
    const res = editing
      ? await updateCustomer({}, fd)
      : await createCustomer({}, fd);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    toast.push(editing ? "Customer updated" : "Customer added", "success");
    onClose();
    router.refresh();
    onSaved?.("id" in res ? (res.id as string) : undefined);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit customer" : "New customer"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add customer"}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={onSubmit} className="space-y-4">
        {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
        <Field label="Full name">
          <Input name="name" required defaultValue={initial?.name ?? ""} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input name="phone" defaultValue={initial?.phone ?? ""} placeholder="876-000-0000" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={initial?.email ?? ""} />
          </Field>
        </div>
        <Field label="Address">
          <Input name="address" defaultValue={initial?.address ?? ""} />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" defaultValue={initial?.notes ?? ""} rows={2} />
        </Field>
        {error ? <p className="text-sm text-[var(--tone-red-fg)]">{error}</p> : null}
      </form>
    </Modal>
  );
}
