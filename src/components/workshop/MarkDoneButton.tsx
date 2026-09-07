"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { markWorkDone } from "@/lib/actions/workorders";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

const ACTIVE = ["assigned", "in_progress", "awaiting_parts", "awaiting_customer_approval"];

export function MarkDoneButton({
  workOrderId,
  done,
  status,
}: {
  workOrderId: string;
  done: boolean;
  status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  if (done) return <span className="text-xs text-[var(--tone-green-fg)]">✓ You marked this done</span>;
  if (!ACTIVE.includes(status)) return null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Mark work done
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          try {
            const r = await markWorkDone(workOrderId);
            toast.push(
              r === "repair_completed" ? "Job complete — sent to the cashier" : "Marked done",
              "success",
            );
            router.refresh();
          } catch (e) {
            toast.push((e as Error).message, "error");
          }
          setPending(false);
          setOpen(false);
        }}
        title="Mark your work done"
        message="Closes your clock. When every assigned technician is done, the job moves to repair-complete and payment is requested."
        confirmLabel="Mark done"
        pending={pending}
      />
    </>
  );
}
