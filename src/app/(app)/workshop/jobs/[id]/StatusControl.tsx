"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setWorkOrderStatus } from "@/lib/actions/workorders";
import { nextStatuses, WORK_ORDER_STATUS_LABELS } from "@/lib/status";
import type { WorkOrderStatus } from "@/types/domain";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function StatusControl({
  id,
  status,
  canManage,
  hasBalance,
}: {
  id: string;
  status: WorkOrderStatus;
  canManage: boolean;
  hasBalance: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const options = nextStatuses(status).filter((s) => s !== "cancelled" && s !== "checked_out");

  async function move(to: WorkOrderStatus, why?: string) {
    setPending(true);
    try {
      await setWorkOrderStatus(id, to, why);
      toast.push(`Moved to ${WORK_ORDER_STATUS_LABELS[to]}`, "success");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
    setCancelOpen(false);
  }

  if (!canManage) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((to) => (
        <Button key={to} size="sm" variant="secondary" disabled={pending} onClick={() => move(to)}>
          → {WORK_ORDER_STATUS_LABELS[to]}
        </Button>
      ))}
      {status === "ready_for_pickup" ? (
        <Button size="sm" variant="primary" onClick={() => router.push(`/workshop/jobs/${id}/checkout`)}>
          Check out vehicle
        </Button>
      ) : null}
      {!["checked_out", "cancelled"].includes(status) ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCancelOpen(true)}>
          Cancel job
        </Button>
      ) : null}
      {hasBalance && status === "ready_for_payment" ? (
        <span className="text-xs text-[var(--tone-amber-fg)]">Outstanding balance — settle on the invoice</span>
      ) : null}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this job"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={pending}>
              Keep job
            </Button>
            <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => move("cancelled", reason)}>
              Cancel job
            </Button>
          </>
        }
      >
        <Field label="Reason" hint="Recorded in the audit log.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
      </Modal>
    </div>
  );
}
