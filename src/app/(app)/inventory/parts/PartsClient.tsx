"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { savePart, adjustStock } from "@/lib/actions/inventory";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export interface Part {
  id: string;
  name: string;
  part_number: string | null;
  category: string | null;
  supplier_id: string | null;
  fitment: string | null;
  cost: number;
  price: number;
  quantity: number;
  min_stock: number;
  location: string | null;
  notes: string | null;
}

export function NewPartButton({ suppliers, currency }: { suppliers: { id: string; name: string }[]; currency: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} data-tour="new-part">
        New part
      </Button>
      <PartFormModal open={open} onClose={() => setOpen(false)} suppliers={suppliers} currency={currency} />
    </>
  );
}

export function PartFormModal({
  open,
  onClose,
  initial,
  suppliers,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Part;
  suppliers: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState(savePart, {});
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (state.ok) {
      toast.push("Saved", "success");
      onClose();
      router.refresh();
    }
    if (state.error) toast.push(state.error, "error");
  }, [state, toast, router, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit part" : "New part"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="part-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="part-form" action={action} className="space-y-3">
        {editing ? <input type="hidden" name="id" value={initial!.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" required defaultValue={initial?.name ?? ""} />
          </Field>
          <Field label="Part number">
            <Input name="part_number" defaultValue={initial?.part_number ?? ""} className="uppercase" />
          </Field>
          <Field label="Category">
            <Input name="category" defaultValue={initial?.category ?? ""} placeholder="Brakes, Filters…" />
          </Field>
          <Field label="Supplier">
            <Select name="supplier_id" defaultValue={initial?.supplier_id ?? ""}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Fits (compatible vehicles)">
          <Input name="fitment" defaultValue={initial?.fitment ?? ""} placeholder="Toyota Corolla 2014–2019" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={`Cost (${currency})`}>
            <Input name="cost" type="number" min="0" defaultValue={initial?.cost ?? 0} />
          </Field>
          <Field label={`Sell price (${currency})`}>
            <Input name="price" type="number" min="0" defaultValue={initial?.price ?? 0} />
          </Field>
          <Field label="Min stock">
            <Input name="min_stock" type="number" min="0" defaultValue={initial?.min_stock ?? 0} />
          </Field>
          {editing ? (
            <Field label="On hand">
              <Input value={initial!.quantity} disabled />
            </Field>
          ) : (
            <Field label="Opening stock">
              <Input name="quantity" type="number" min="0" defaultValue={0} />
            </Field>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Storage location">
            <Input name="location" defaultValue={initial?.location ?? ""} placeholder="Shelf A3" />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
        </Field>
      </form>
    </Modal>
  );
}

export function StockAdjustModal({
  open,
  onClose,
  part,
  suppliers,
}: {
  open: boolean;
  onClose: () => void;
  part: { id: string; name: string; quantity: number };
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [f, setF] = React.useState({ type: "receive", qty: "", unit_cost: "", supplier_id: "", reference: "", note: "" });

  async function submit() {
    setPending(true);
    try {
      const raw = Number(f.qty) || 0;
      const delta =
        f.type === "remove" ? -Math.abs(raw) : f.type === "adjust" ? raw - part.quantity : Math.abs(raw);
      await adjustStock({
        part_id: part.id,
        type: f.type as "receive" | "add" | "remove" | "adjust",
        quantity_delta: delta,
        unit_cost: f.unit_cost ? Number(f.unit_cost) : undefined,
        supplier_id: f.supplier_id || undefined,
        reference: f.reference || undefined,
        note: f.note || undefined,
      });
      toast.push("Stock updated", "success");
      onClose();
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Adjust stock — ${part.name}`}
      description={`Currently ${part.quantity} on hand`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !f.qty}>
            {pending ? "Saving…" : "Apply"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Field label="Type">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="receive">Receive from supplier</option>
            <option value="add">Add (found stock)</option>
            <option value="remove">Remove (damaged / lost)</option>
            <option value="adjust">Set count to…</option>
          </Select>
        </Field>
        <Field label={f.type === "adjust" ? "New count" : "Quantity"}>
          <Input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </Field>
        {f.type === "receive" ? (
          <>
            <Field label="Unit cost">
              <Input type="number" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: e.target.value })} />
            </Field>
            <Field label="Supplier">
              <Select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference / invoice no.">
              <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </Field>
          </>
        ) : null}
        <Field label="Note">
          <Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export function PartRowActions({
  part,
  suppliers,
  currency,
}: {
  part: Part;
  suppliers: { id: string; name: string }[];
  currency: string;
}) {
  const [edit, setEdit] = React.useState(false);
  const [adjust, setAdjust] = React.useState(false);
  return (
    <>
      <button onClick={() => setAdjust(true)} className="text-xs text-brand hover:underline">
        Adjust
      </button>{" "}
      <button onClick={() => setEdit(true)} className="text-xs text-text-muted hover:text-text">
        Edit
      </button>
      <PartFormModal open={edit} onClose={() => setEdit(false)} initial={part} suppliers={suppliers} currency={currency} />
      <StockAdjustModal open={adjust} onClose={() => setAdjust(false)} part={part} suppliers={suppliers} />
    </>
  );
}

void money;
