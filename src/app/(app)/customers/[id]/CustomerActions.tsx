"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteCustomer } from "@/lib/actions/customers";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CustomerFormModal, type CustomerFormValues } from "../CustomerFormModal";

export function CustomerActions({
  customer,
  canDelete,
}: {
  customer: CustomerFormValues & { id: string; name: string };
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setEdit(true)}>
        Edit
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          if (!canDelete) {
            toast.push("Remove this customer's vehicles first.", "error");
            return;
          }
          setConfirm(true);
        }}
      >
        Delete
      </Button>
      <CustomerFormModal open={edit} onClose={() => setEdit(false)} initial={customer} />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setPending(true);
          try {
            const fd = new FormData();
            fd.set("id", customer.id);
            await deleteCustomer(fd);
            toast.push("Customer deleted", "success");
            router.push("/customers");
          } catch (e) {
            toast.push((e as Error).message, "error");
            setPending(false);
            setConfirm(false);
          }
        }}
        title="Delete customer"
        message={`Delete ${customer.name}? This can't be undone from the app.`}
        confirmLabel="Delete"
        destructive
        pending={pending}
      />
    </>
  );
}
