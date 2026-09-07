"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge, Td } from "@/components/ui/primitives";
import { CustomerFormModal } from "./CustomerFormModal";

export function NewCustomerButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} data-tour="new-customer">
        New customer
      </Button>
      <CustomerFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CustomerRow({
  id,
  name,
  phone,
  email,
  vehicleCount,
  openJobs,
}: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  vehicleCount: number;
  openJobs: number;
}) {
  return (
    <tr className="hover:bg-surface-2">
      <Td>
        <Link href={`/customers/${id}`} className="font-medium text-brand hover:underline">
          {name}
        </Link>
      </Td>
      <Td className="text-text-muted">{phone ?? "—"}</Td>
      <Td className="text-text-muted">{email ?? "—"}</Td>
      <Td>{vehicleCount}</Td>
      <Td>{openJobs > 0 ? <Badge tone="violet">{openJobs} open</Badge> : <span className="text-text-subtle">—</span>}</Td>
    </tr>
  );
}
