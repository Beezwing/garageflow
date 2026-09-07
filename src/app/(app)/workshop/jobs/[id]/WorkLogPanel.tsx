"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addWorkNote, markWorkDone } from "@/lib/actions/workorders";
import { dateTime } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Note {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  author: string | null;
}

export function WorkLogPanel({
  woId,
  notes,
  canWrite,
  canMarkDone,
  alreadyDone,
  status,
}: {
  woId: string;
  notes: Note[];
  canWrite: boolean;
  canMarkDone: boolean;
  alreadyDone: boolean;
  status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<"work" | "diagnosis" | "note">("work");
  const [pending, setPending] = React.useState(false);
  const [confirmDone, setConfirmDone] = React.useState(false);

  async function add() {
    setPending(true);
    try {
      await addWorkNote(woId, body, kind);
      setBody("");
      toast.push("Added to the work log", "success");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  async function finish() {
    setPending(true);
    try {
      const result = await markWorkDone(woId, body.trim() || undefined);
      setBody("");
      toast.push(
        result === "repair_completed" ? "Job marked repair-complete — sent for payment" : "Your work is marked done",
        "success",
      );
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
    setConfirmDone(false);
  }

  const canStillFinish =
    canMarkDone &&
    !alreadyDone &&
    ["assigned", "in_progress", "awaiting_parts", "awaiting_customer_approval"].includes(status);

  return (
    <Card data-tour="work-log">
      <CardHeader>
        <CardTitle>Work log &amp; notes</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-text-muted">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-[var(--radius)] bg-surface-2 px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap text-text">{n.body}</p>
                <p className="mt-1 text-xs text-text-subtle">
                  {n.kind !== "work" ? `${n.kind} · ` : ""}
                  {n.author ?? "—"} · {dateTime(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {canWrite ? (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex gap-2">
              {(["work", "diagnosis", "note"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded px-2 py-1 text-xs font-medium capitalize ${
                    kind === k ? "bg-brand text-brand-fg" : "bg-surface-2 text-text-muted"
                  }`}
                >
                  {k === "work" ? "work performed" : k}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="What did you find / do?"
              className="w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={pending || !body.trim()} onClick={add}>
                Add note
              </Button>
              {canStillFinish ? (
                <Button size="sm" disabled={pending} onClick={() => setConfirmDone(true)}>
                  Mark my work done
                </Button>
              ) : null}
            </div>
            {alreadyDone ? (
              <p className="text-xs text-[var(--tone-green-fg)]">You&apos;ve marked your work done on this job.</p>
            ) : null}
          </div>
        ) : null}
      </CardBody>

      <ConfirmDialog
        open={confirmDone}
        onClose={() => setConfirmDone(false)}
        onConfirm={finish}
        title="Mark your work done"
        message="This closes your clock. When every assigned technician is done the job moves to repair-complete and the cashier is asked for payment."
        confirmLabel="Mark done"
        pending={pending}
      />
    </Card>
  );
}
