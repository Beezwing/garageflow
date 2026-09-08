"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveSafetyTip, toggleSafetyTip, deleteSafetyTip, type SafetyTip } from "@/lib/actions/safety";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Card, CardBody, CardHeader, CardTitle, Field, Input, Textarea, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

const ICON: Record<string, string> = { critical: "🚨", warning: "⚠️", info: "🦺" };
const CATEGORIES = ["PPE", "Lifting", "Electrical", "Fire", "Chemicals", "Tyres", "General"];

export function SafetyEditor({ tips }: { tips: SafetyTip[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<SafetyTip | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<SafetyTip | null>(null);
  const [state, action, pending] = useActionState(saveSafetyTip, {});

  useEffect(() => {
    if (state.ok) {
      toast.push("Saved", "success");
      setEditing(null);
      setCreating(false);
      router.refresh();
    }
    if (state.error) toast.push(state.error, "error");
  }, [state, toast, router]);

  const target = editing ?? (creating ? ({} as Partial<SafetyTip>) : null);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Your shop&apos;s tips ({tips.length})</CardTitle>
        <Button size="sm" onClick={() => setCreating(true)}>
          Add tip
        </Button>
      </CardHeader>
      <CardBody className="space-y-2">
        {tips.length === 0 ? (
          <p className="text-sm text-text-muted">
            None yet. Add reminders about your equipment, layout or the jobs you do most.
          </p>
        ) : (
          tips.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${t.active ? "text-text" : "text-text-subtle line-through"}`}>
                  {ICON[t.severity] ?? "🦺"} {t.title}
                  {t.category ? <span className="ml-1 text-xs text-text-subtle">· {t.category}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">{t.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={async () => {
                    await toggleSafetyTip(t.id, !t.active);
                    router.refresh();
                  }}
                  className="text-text-muted hover:text-text"
                >
                  {t.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => setEditing(t)} className="text-brand hover:underline">
                  Edit
                </button>
                <button onClick={() => setDeleting(t)} className="text-[var(--tone-red-fg)]">
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </CardBody>

      <Modal
        open={target !== null}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        title={editing ? "Edit safety tip" : "New safety tip"}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" form="safety-form" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {target !== null ? (
          <form id="safety-form" action={action} className="space-y-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Title">
              <Input name="title" required defaultValue={editing?.title ?? ""} placeholder="Check the two-post lift locks" />
            </Field>
            <Field label="Reminder">
              <Textarea name="body" required rows={3} defaultValue={editing?.body ?? ""} placeholder="What to do, and why it matters." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select name="category" defaultValue={editing?.category ?? "General"}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Severity">
                <Select name="severity" defaultValue={editing?.severity ?? "warning"}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
            </div>
            <Field label="Order" hint="Lower shows first.">
              <Input name="sort_order" type="number" defaultValue={editing?.sort_order ?? 50} />
            </Field>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteSafetyTip(deleting.id);
          setDeleting(null);
          router.refresh();
        }}
        title="Delete tip"
        message={`Remove "${deleting?.title}"?`}
        confirmLabel="Delete"
        destructive
      />
    </Card>
  );
}
