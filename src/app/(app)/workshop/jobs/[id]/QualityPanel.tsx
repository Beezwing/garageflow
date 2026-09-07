"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { submitQualityInspection } from "@/lib/actions/workorders";
import { dateTime } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const DEFAULT_CHECKS = [
  "Requested repairs completed",
  "Repair checklist completed",
  "Additional approved work completed",
  "Vehicle road tested",
  "Warning lights checked",
  "No tools or materials left in vehicle",
  "Vehicle condition acceptable",
  "Ready for customer",
];

export function QualityPanel({
  woId,
  existing,
  canPerform,
  checks,
}: {
  woId: string;
  existing: { id: string; passed: boolean; notes: string | null; created_at: string; by: string | null }[];
  canPerform: boolean;
  checks?: string[];
}) {
  const CHECKS = checks && checks.length ? checks : DEFAULT_CHECKS;
  const router = useRouter();
  const toast = useToast();
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [open, setOpen] = React.useState(existing.length === 0);

  const allChecked = CHECKS.every((c) => checked[c]);

  async function submit(passed: boolean) {
    setPending(true);
    try {
      await submitQualityInspection(woId, {
        checklist: CHECKS.map((c) => ({ item: c, checked: !!checked[c] })),
        passed,
        notes: notes || undefined,
      });
      toast.push(passed ? "Quality check passed" : "Quality check recorded", "success");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <Card data-tour="quality-panel">
      <CardHeader>
        <CardTitle>Quality control</CardTitle>
        {existing.length ? (
          <button onClick={() => setOpen((o) => !o)} className="text-xs text-brand hover:underline">
            {open ? "Hide" : "New check"}
          </button>
        ) : null}
      </CardHeader>
      <CardBody className="space-y-3">
        {existing.map((q) => (
          <div key={q.id} className="flex items-center justify-between rounded bg-surface-2 px-2.5 py-2 text-sm">
            <span className="text-text-muted">
              {q.by ?? "—"} · {dateTime(q.created_at)}
              {q.notes ? ` — ${q.notes}` : ""}
            </span>
            <Badge tone={q.passed ? "green" : "red"}>{q.passed ? "Passed" : "Failed"}</Badge>
          </div>
        ))}

        {canPerform && open ? (
          <div className="space-y-2">
            {CHECKS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={!!checked[c]}
                  onChange={(e) => setChecked({ ...checked, [c]: e.target.checked })}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                {c}
              </label>
            ))}
            <textarea
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending || !allChecked} onClick={() => submit(true)}>
                Pass &amp; advance
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => submit(false)}>
                Record as failed
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
