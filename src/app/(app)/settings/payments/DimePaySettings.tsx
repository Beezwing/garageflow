"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  saveDimePayCredentials,
  setDimePayEnabled,
  disconnectDimePay,
  type DimePayStatus,
} from "@/lib/actions/payments-providers";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function DimePaySettings({ initial }: { initial: DimePayStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState(!initial.connected);
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState({ clientKey: "", signingSecret: "", sandbox: true });

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-3">
          <div className="text-sm">
            <p className="font-medium text-text">
              Connected{initial.sandbox ? " · sandbox" : " · live"} — {initial.clientKeyMasked}
            </p>
            <p className="text-text-muted">
              {initial.enabled ? "Customers can pay invoices with DimePay." : "Currently turned off."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const res = await setDimePayEnabled(!initial.enabled);
                setPending(false);
                if (!res.ok) toast.push(res.error || "Couldn't update that.", "error");
                else router.refresh();
              }}
            >
              {initial.enabled ? "Turn off" : "Turn on"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Replace keys
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="text-xs text-[var(--tone-red-fg)] hover:underline"
          disabled={pending}
          onClick={async () => {
            if (!confirm("Disconnect DimePay for this garage? Customers won't be able to pay this way until you reconnect.")) return;
            setPending(true);
            const res = await disconnectDimePay();
            setPending(false);
            if (!res.ok) toast.push(res.error || "Couldn't disconnect.", "error");
            else router.refresh();
          }}
        >
          Disconnect DimePay
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="API key (client key)">
        <Input
          value={form.clientKey}
          onChange={(e) => setForm((f) => ({ ...f, clientKey: e.target.value }))}
          placeholder="From DimePay dashboard → Developer"
          autoComplete="off"
        />
      </Field>
      <Field label="Signing secret" hint="Kept private — never shown again after saving.">
        <Input
          type="password"
          value={form.signingSecret}
          onChange={(e) => setForm((f) => ({ ...f, signingSecret: e.target.value }))}
          autoComplete="off"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-text-muted">
        <input
          type="checkbox"
          checked={form.sandbox}
          onChange={(e) => setForm((f) => ({ ...f, sandbox: e.target.checked }))}
          className="h-4 w-4"
        />
        Sandbox mode (test payments — turn off once you&rsquo;ve confirmed a real one works)
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !form.clientKey.trim() || !form.signingSecret.trim()}
          onClick={async () => {
            setPending(true);
            const res = await saveDimePayCredentials(form);
            setPending(false);
            if (!res.ok) {
              toast.push(res.error || "Couldn't save that.", "error");
              return;
            }
            toast.push("DimePay connected", "success");
            setEditing(false);
            router.refresh();
          }}
        >
          {pending ? "Saving…" : "Connect DimePay"}
        </Button>
        {initial.connected ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
