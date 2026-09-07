"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { requestAdditionalWork, recordApproval, overrideAdditionalWork } from "@/lib/actions/workorders";
import { money } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Req {
  id: string;
  problem: string;
  recommendation: string | null;
  price: number;
  status: string;
  requested_by: string | null;
  requester: string | null;
  approval?: { decision: string; amount: number; method: string };
}

const TONE: Record<string, "amber" | "green" | "red" | "gray"> = {
  pending: "amber",
  approved: "green",
  declined: "red",
  overridden: "gray",
};

export function AdditionalWorkPanel({
  woId,
  garageId,
  currency,
  requests,
  currentUserId,
  canRequest,
  canApprove,
  canOverride,
}: {
  woId: string;
  garageId: string;
  currency: string;
  requests: Req[];
  currentUserId: string;
  canRequest: boolean;
  canApprove: boolean;
  canOverride: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [form, setForm] = React.useState({
    problem: "",
    recommendation: "",
    parts_estimate: "",
    labor_estimate: "",
    price: "",
    technician_notes: "",
  });
  const [decideFor, setDecideFor] = React.useState<Req | null>(null);
  const [decision, setDecision] = React.useState({ decision: "approved" as "approved" | "declined", method: "phone", notes: "" });
  const [overrideFor, setOverrideFor] = React.useState<Req | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setPending(true);
    try {
      await fn();
      router.refresh();
      after?.();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <Card data-tour="additional-work-panel">
      <CardHeader>
        <CardTitle>Additional work</CardTitle>
        {canRequest ? (
          <Button size="sm" variant="secondary" onClick={() => setShowNew(true)}>
            Request
          </Button>
        ) : null}
      </CardHeader>
      <CardBody className="space-y-3">
        {requests.length === 0 ? (
          <p className="text-sm text-text-muted">No additional work discovered.</p>
        ) : (
          requests.map((r) => {
            const isOwnRequest = r.requested_by === currentUserId;
            return (
              <div key={r.id} className="rounded-[var(--radius)] border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-text">{r.problem}</p>
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                </div>
                {r.recommendation ? <p className="mt-1 text-text-muted">{r.recommendation}</p> : null}
                <p className="mt-1 text-text-muted">
                  Estimate: <span className="font-medium text-text">{money(r.price, currency)}</span>
                  {r.requester ? ` · raised by ${r.requester}` : ""}
                </p>
                {r.approval ? (
                  <p className="mt-1 text-xs text-text-subtle">
                    Customer {r.approval.decision} {money(r.approval.amount, currency)} via {r.approval.method}
                  </p>
                ) : null}

                {r.status === "pending" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canApprove && !isOwnRequest ? (
                      <Button size="sm" onClick={() => (setDecideFor(r), setDecision({ decision: "approved", method: "phone", notes: "" }))}>
                        Record customer decision
                      </Button>
                    ) : null}
                    {canApprove && isOwnRequest ? (
                      <span className="text-xs text-[var(--tone-amber-fg)]">
                        You raised this — another staff member must record the approval.
                      </span>
                    ) : null}
                    {canOverride ? (
                      <Button size="sm" variant="ghost" onClick={() => (setOverrideFor(r), setOverrideReason(""))}>
                        Override
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardBody>

      {/* New request */}
      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Request additional work"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNew(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || !form.problem.trim()}
              onClick={() =>
                run(
                  () =>
                    requestAdditionalWork(woId, {
                      problem: form.problem,
                      recommendation: form.recommendation || undefined,
                      parts_estimate: Number(form.parts_estimate) || 0,
                      labor_estimate: Number(form.labor_estimate) || 0,
                      price:
                        Number(form.price) ||
                        (Number(form.parts_estimate) || 0) + (Number(form.labor_estimate) || 0),
                      technician_notes: form.technician_notes || undefined,
                    }),
                  () => {
                    setShowNew(false);
                    setForm({ problem: "", recommendation: "", parts_estimate: "", labor_estimate: "", price: "", technician_notes: "" });
                  },
                )
              }
            >
              Submit for approval
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <textarea
            placeholder="Problem discovered *"
            value={form.problem}
            onChange={(e) => setForm({ ...form, problem: e.target.value })}
            className="w-full rounded border border-border bg-surface px-2 py-1.5"
            rows={2}
          />
          <textarea
            placeholder="Recommended repair"
            value={form.recommendation}
            onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
            className="w-full rounded border border-border bg-surface px-2 py-1.5"
            rows={2}
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              placeholder="Parts est."
              value={form.parts_estimate}
              onChange={(e) => setForm({ ...form, parts_estimate: e.target.value })}
              className="rounded border border-border bg-surface px-2 py-1.5"
            />
            <input
              type="number"
              placeholder="Labour est."
              value={form.labor_estimate}
              onChange={(e) => setForm({ ...form, labor_estimate: e.target.value })}
              className="rounded border border-border bg-surface px-2 py-1.5"
            />
            <input
              type="number"
              placeholder="Total price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="rounded border border-border bg-surface px-2 py-1.5"
            />
          </div>
        </div>
      </Modal>

      {/* Record decision */}
      <Modal
        open={!!decideFor}
        onClose={() => setDecideFor(null)}
        title="Record customer decision"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecideFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    recordApproval(decideFor!.id, woId, {
                      decision: decision.decision,
                      method: decision.method,
                      notes: decision.notes || undefined,
                    }),
                  () => setDecideFor(null),
                )
              }
            >
              Save decision
            </Button>
          </>
        }
      >
        {decideFor ? (
          <div className="space-y-3 text-sm">
            <p className="text-text-muted">
              {decideFor.problem} — {money(decideFor.price, currency)}
            </p>
            <div className="flex gap-2">
              {(["approved", "declined"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDecision({ ...decision, decision: d })}
                  className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                    decision.decision === d ? "bg-brand text-brand-fg" : "bg-surface-2 text-text-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <select
              value={decision.method}
              onChange={(e) => setDecision({ ...decision, method: e.target.value })}
              className="w-full rounded border border-border bg-surface px-2 py-1.5"
            >
              {["phone", "in_person", "sms", "whatsapp", "email"].map((m) => (
                <option key={m} value={m}>
                  {m.replace("_", " ")}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Notes"
              value={decision.notes}
              onChange={(e) => setDecision({ ...decision, notes: e.target.value })}
              className="w-full rounded border border-border bg-surface px-2 py-1.5"
              rows={2}
            />
          </div>
        ) : null}
      </Modal>

      {/* Override */}
      <Modal
        open={!!overrideFor}
        onClose={() => setOverrideFor(null)}
        title="Override customer approval"
        description="Use only in exceptional cases. This is audit-logged."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverrideFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending || !overrideReason.trim()}
              onClick={() =>
                run(
                  () => overrideAdditionalWork(overrideFor!.id, woId, garageId, overrideReason, overrideFor!.price),
                  () => setOverrideFor(null),
                )
              }
            >
              Override
            </Button>
          </>
        }
      >
        <textarea
          placeholder="Reason for override *"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          rows={3}
        />
      </Modal>
    </Card>
  );
}
