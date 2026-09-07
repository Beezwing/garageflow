"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { VehicleFormModal } from "./VehicleFormModal";

export function NewVehicleButton({ customers }: { customers: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} data-tour="new-vehicle">
        New vehicle
      </Button>
      <VehicleFormModal open={open} onClose={() => setOpen(false)} customers={customers} />
    </>
  );
}
