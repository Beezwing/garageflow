"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveSupplier, deleteSupplier } from "@/lib/actions/inventory";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export function NewSupplierButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New supplier</Button>
      <SupplierFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SupplierFormModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Supplier;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(saveSupplier, {});
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (state.ok) {
      toast.push("Saved", "success");
      onClose();
      router.refresh();
    }
    if (state.error) toast.push(state.error, "error");
  }, [state, toast, router, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit supplier" : "New supplier"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="supplier-form" action={action} className="space-y-3">
        {editing ? <input type="hidden" name="id" value={initial!.id} /> : null}
        <Field label="Business name">
          <Input name="name" required defaultValue={initial?.name ?? ""} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact person">
            <Input name="contact_person" defaultValue={initial?.contact_person ?? ""} />
          </Field>
          <Field label="Phone">
            <Input name="phone" defaultValue={initial?.phone ?? ""} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={initial?.email ?? ""} />
          </Field>
          <Field label="Address">
            <Input name="address" defaultValue={initial?.address ?? ""} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
        </Field>
      </form>
    </Modal>
  );
}

export function SupplierActions({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const [del, setDel] = React.useState(false);
  return (
    <>
      <button onClick={() => setEdit(true)} className="text-xs text-brand hover:underline">
        Edit
      </button>{" "}
      <button onClick={() => setDel(true)} className="text-xs text-[var(--tone-red-fg)]">
        ✕
      </button>
      <SupplierFormModal open={edit} onClose={() => setEdit(false)} initial={supplier} />
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        onConfirm={async () => {
          await deleteSupplier(supplier.id);
          setDel(false);
          router.refresh();
        }}
        title="Remove supplier"
        message={`Remove ${supplier.name}? Parts stay, but lose their supplier link.`}
        confirmLabel="Remove"
        destructive
      />
    </>
  );
}
