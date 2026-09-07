"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { VehicleFormModal, type VehicleFormValues } from "../VehicleFormModal";

export function VehicleActions({
  vehicle,
  customers,
}: {
  vehicle: VehicleFormValues & { id: string };
  customers: { id: string; name: string }[];
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
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        Delete
      </Button>
      <VehicleFormModal open={edit} onClose={() => setEdit(false)} initial={vehicle} customers={customers} />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setPending(true);
          try {
            const fd = new FormData();
            fd.set("id", vehicle.id);
            await deleteVehicle(fd);
            toast.push("Vehicle deleted", "success");
            router.push("/vehicles");
          } catch (e) {
            toast.push((e as Error).message, "error");
            setPending(false);
            setConfirm(false);
          }
        }}
        title="Delete vehicle"
        message="Delete this vehicle? Its service history stays on the customer record."
        confirmLabel="Delete"
        destructive
        pending={pending}
      />
    </>
  );
}
