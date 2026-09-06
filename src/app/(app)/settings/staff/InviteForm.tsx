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

  useEffect(() => {
    if (state.ok && state.inviteUrl) {
      setLastUrl(state.inviteUrl);
      toast.push("Invitation created", "success");
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
            Share this link with the invitee (they sign up with the invited email):
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
