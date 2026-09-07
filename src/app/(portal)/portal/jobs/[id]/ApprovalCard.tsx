"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { respondAdditionalWork } from "@/lib/actions/portal";
import { money, dateTime } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function ApprovalCard({
  workOrderId,
  request,
  decidedAt,
  currency,
}: {
  workOrderId: string;
  request: { id: string; problem: string; recommendation: string | null; price: number; status: string };
  decidedAt: string | null;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  async function decide(decision: "approved" | "declined") {
    setPending(true);
    try {
      await respondAdditionalWork(workOrderId, { request_id: request.id, decision });
      toast.push(decision === "approved" ? "Approved — thank you" : "Declined", "success");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  const isPending = request.status === "pending";

  return (
    <Card className={isPending ? "border-[var(--tone-amber-fg)]" : ""}>
      <CardBody className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tone-amber-fg)]">
          {isPending ? "Approval needed" : `Additional work — ${request.status}`}
        </p>
        <p className="font-medium text-text">{request.problem}</p>
        {request.recommendation ? <p className="text-sm text-text-muted">{request.recommendation}</p> : null}
        <p className="text-sm">
          Additional cost: <span className="font-semibold text-text">{money(request.price, currency)}</span>
        </p>
        {isPending ? (
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={pending} onClick={() => decide("approved")}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("declined")}>
              Decline
            </Button>
          </div>
        ) : (
          <p className="text-xs text-text-subtle">
            You {request.status} this{decidedAt ? ` on ${dateTime(decidedAt)}` : ""}.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
