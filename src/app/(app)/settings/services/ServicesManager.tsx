"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveService, toggleService, deleteService } from "@/lib/actions/services";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Card, CardBody, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  default_price: number;
  est_labor_minutes: number;
  active: boolean;
}

export function ServicesManager({ currency, services }: { currency: string; services: Service[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<Service | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Service | null>(null);
  const [state, action, pending] = useActionState(saveService, {});

  useEffect(() => {
    if (state.ok) {
      toast.push("Saved", "success");
      setEditing(null);
      setCreating(false);
      router.refresh();
    }
    if (state.error) toast.push(state.error, "error");
  }, [state, toast, router]);

  const byCategory = new Map<string, Service[]>();
  services.forEach((s) => {
    const k = s.category || "Uncategorised";
    byCategory.set(k, [...(byCategory.get(k) ?? []), s]);
  });

  const target = editing ?? (creating ? ({} as Partial<Service>) : null);

  return (
    <div className="space-y-4">
      <Button onClick={() => setCreating(true)} data-tour="new-service">
        New service
      </Button>

      {[...byCategory.entries()].map(([cat, list]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle>{cat}</CardTitle>
          </CardHeader>
          <CardBody className="divide-y divide-border">
            {list.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${s.active ? "text-text" : "text-text-subtle line-through"}`}>
                    {s.name}
                  </p>
                  {s.description ? <p className="truncate text-xs text-text-muted">{s.description}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-text">{money(s.default_price, currency)}</span>
                  {s.est_labor_minutes ? (
                    <span className="text-xs text-text-subtle">{s.est_labor_minutes}m</span>
                  ) : null}
                  <button
                    onClick={async () => {
                      await toggleService(s.id, !s.active);
                      router.refresh();
                    }}
                    className="text-xs text-text-muted hover:text-text"
                  >
                    {s.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => setEditing(s)} className="text-xs text-brand hover:underline">
                    Edit
                  </button>
                  <button onClick={() => setDeleting(s)} className="text-xs text-[var(--tone-red-fg)]">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      <Modal
        open={target !== null}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        title={editing ? "Edit service" : "New service"}
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
            <Button type="submit" form="service-form" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {target !== null ? (
          <form id="service-form" action={action} className="space-y-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Name">
              <Input name="name" required defaultValue={editing?.name ?? ""} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Input name="category" defaultValue={editing?.category ?? ""} placeholder="Maintenance" />
              </Field>
              <Field label={`Default price (${currency})`}>
                <Input name="default_price" type="number" min="0" defaultValue={editing?.default_price ?? 0} />
              </Field>
            </div>
            <Field label="Estimated labour (minutes)">
              <Input name="est_labor_minutes" type="number" min="0" defaultValue={editing?.est_labor_minutes ?? 0} />
            </Field>
            <Field label="Description">
              <Textarea name="description" rows={2} defaultValue={editing?.description ?? ""} />
            </Field>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteService(deleting.id);
          setDeleting(null);
          router.refresh();
        }}
        title="Delete service"
        message={`Remove "${deleting?.name}" from the catalogue? Past invoices keep their line items.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
