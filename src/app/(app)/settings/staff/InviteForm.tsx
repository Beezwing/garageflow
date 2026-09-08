"use client";

import { useActionState, useEffect, useState } from "react";
import { inviteStaff } from "@/lib/actions/staff";
import { ROLE_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function InviteForm() {
  const toast = useToast();
  const [state, action, pending] = useActionState(inviteStaff, {});
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);

  useEffect(() => {
    if (state.ok && state.inviteUrl) {
      setLastUrl(state.inviteUrl);
      setEmailed(Boolean(state.emailed));
      toast.push(state.emailed ? "Invitation emailed" : "Invitation created", "success");
    }
    if (state.error) toast.push(state.error, "error");
  }, [state, toast]);

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Email" className="flex-1">
          <Input name="email" type="email" required placeholder="name@example.com" />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="technician">
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create invite"}
        </Button>
      </form>

      {lastUrl ? (
        <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-3">
          <p className="text-xs font-medium text-text-muted">
            {emailed
              ? "We emailed the invite. This link also works — copy it if you'd rather send it yourself (WhatsApp, SMS):"
              : "Send this link to the invitee — they accept by signing in with the invited email address:"}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-surface px-2 py-1 text-xs">{lastUrl}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(lastUrl);
                toast.push("Link copied", "success");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
