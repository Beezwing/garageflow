"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addPartLine, addLabor, addServiceLine, removeChargeLine } from "@/lib/actions/workorders";
import { money } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface Line {
  id: string;
  description: string;
  amount: number;
}
interface PartLine extends Line {
  quantity: number;
  unit_price: number;
}
interface LaborLine extends Line {
  hours: number;
  rate: number;
}
interface ServiceLine extends Line {
  quantity: number;
  unit_price: number;
}

export function ChargesPanel({
  woId,
  currency,
  parts,
  labor,
  services,
  catalogue,
  stockParts,
  defaultRate,
  canEdit,
  canUseParts,
}: {
  woId: string;
  currency: string;
  parts: PartLine[];
  labor: LaborLine[];
  services: ServiceLine[];
  catalogue: { id: string; name: string; default_price: number }[];
  stockParts: { id: string; name: string; part_number: string | null; price: number; quantity: number }[];
  defaultRate: number;
  canEdit: boolean;
  canUseParts: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [tab, setTab] = React.useState<"part" | "labor" | "service">("part");

  const [part, setPart] = React.useState({ part_id: "", description: "", quantity: "1", unit_price: "" });
  const [lab, setLab] = React.useState({ description: "", hours: "1", rate: String(defaultRate) });
  const [svc, setSvc] = React.useState({ service_id: "", description: "", quantity: "1", unit_price: "" });

  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <Card data-tour="charges-panel">
      <CardHeader>
        <CardTitle>Parts, labour &amp; services</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <Section title="Parts">
          {parts.map((p) => (
            <Row
              key={p.id}
              label={`${p.description} ×${p.quantity}`}
              value={money(p.amount, currency)}
              onRemove={canEdit ? () => run(() => removeChargeLine("work_order_parts", p.id, woId)) : undefined}
            />
          ))}
        </Section>
        <Section title="Labour">
          {labor.map((l) => (
            <Row
              key={l.id}
              label={`${l.description} · ${l.hours}h @ ${money(l.rate, currency)}`}
              value={money(l.amount, currency)}
              onRemove={canEdit ? () => run(() => removeChargeLine("work_order_labor", l.id, woId)) : undefined}
            />
          ))}
        </Section>
        <Section title="Services">
          {services.map((s) => (
            <Row
              key={s.id}
              label={`${s.description} ×${s.quantity}`}
              value={money(s.amount, currency)}
              onRemove={canEdit ? () => run(() => removeChargeLine("work_order_services", s.id, woId)) : undefined}
            />
          ))}
        </Section>

        {canEdit || canUseParts ? (
          <div className="border-t border-border pt-3">
            <div className="mb-2 flex gap-1">
              {(["part", "labor", "service"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    tab === t ? "bg-brand text-brand-fg" : "bg-surface-2 text-text-muted"
                  }`}
                >
                  Add {t}
                </button>
              ))}
            </div>

            {tab === "part" && canUseParts ? (
              <div className="space-y-2">
                <select
                  value={part.part_id}
                  onChange={(e) => {
                    const sp = stockParts.find((x) => x.id === e.target.value);
                    setPart({
                      ...part,
                      part_id: e.target.value,
                      description: sp?.name ?? part.description,
                      unit_price: sp ? String(sp.price) : part.unit_price,
                    });
                  }}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                >
                  <option value="">Ad-hoc part (not in stock)</option>
                  {stockParts.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name} {sp.part_number ? `(${sp.part_number})` : ""} · {sp.quantity} in stock
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    placeholder="Description"
                    value={part.description}
                    onChange={(e) => setPart({ ...part, description: e.target.value })}
                    className="col-span-3 rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Qty"
                    value={part.quantity}
                    onChange={(e) => setPart({ ...part, quantity: e.target.value })}
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Unit price"
                    value={part.unit_price}
                    onChange={(e) => setPart({ ...part, unit_price: e.target.value })}
                    className="col-span-2 rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={pending || !part.description.trim()}
                  onClick={async () => {
                    await run(() =>
                      addPartLine(woId, {
                        part_id: part.part_id || undefined,
                        description: part.description,
                        quantity: Number(part.quantity) || 1,
                        unit_price: part.unit_price ? Number(part.unit_price) : undefined,
                      }),
                    );
                    setPart({ part_id: "", description: "", quantity: "1", unit_price: "" });
                  }}
                >
                  Add part {part.part_id ? "(deducts stock)" : ""}
                </Button>
              </div>
            ) : null}

            {tab === "labor" && canEdit ? (
              <div className="space-y-2">
                <input
                  placeholder="Description"
                  value={lab.description}
                  onChange={(e) => setLab({ ...lab, description: e.target.value })}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.25"
                    placeholder="Hours"
                    value={lab.hours}
                    onChange={(e) => setLab({ ...lab, hours: e.target.value })}
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Rate/hr"
                    value={lab.rate}
                    onChange={(e) => setLab({ ...lab, rate: e.target.value })}
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={pending || !lab.description.trim()}
                  onClick={async () => {
                    await run(() =>
                      addLabor(woId, {
                        description: lab.description,
                        hours: Number(lab.hours) || 0,
                        rate: Number(lab.rate) || 0,
                      }),
                    );
                    setLab({ description: "", hours: "1", rate: String(defaultRate) });
                  }}
                >
                  Add labour
                </Button>
              </div>
            ) : null}

            {tab === "service" && canEdit ? (
              <div className="space-y-2">
                <select
                  value={svc.service_id}
                  onChange={(e) => {
                    const s = catalogue.find((x) => x.id === e.target.value);
                    setSvc({
                      ...svc,
                      service_id: e.target.value,
                      description: s?.name ?? svc.description,
                      unit_price: s ? String(s.default_price) : svc.unit_price,
                    });
                  }}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                >
                  <option value="">Custom charge</option>
                  {catalogue.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {money(s.default_price, currency)}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Description"
                  value={svc.description}
                  onChange={(e) => setSvc({ ...svc, description: e.target.value })}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={svc.quantity}
                    onChange={(e) => setSvc({ ...svc, quantity: e.target.value })}
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Price"
                    value={svc.unit_price}
                    onChange={(e) => setSvc({ ...svc, unit_price: e.target.value })}
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={pending || !svc.description.trim()}
                  onClick={async () => {
                    await run(() =>
                      addServiceLine(woId, {
                        service_id: svc.service_id || undefined,
                        description: svc.description,
                        quantity: Number(svc.quantity) || 1,
                        unit_price: Number(svc.unit_price) || 0,
                      }),
                    );
                    setSvc({ service_id: "", description: "", quantity: "1", unit_price: "" });
                  }}
                >
                  Add service
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const arr = React.Children.toArray(children);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">{title}</p>
      {arr.length ? <div className="space-y-1">{children}</div> : <p className="text-sm text-text-subtle">None</p>}
    </div>
  );
}

function Row({ label, value, onRemove }: { label: string; value: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate text-text-muted">{label}</span>
      <span className="font-medium text-text">{value}</span>
      {onRemove ? (
        <button onClick={onRemove} className="text-xs text-[var(--tone-red-fg)]">
          ✕
        </button>
      ) : null}
    </div>
  );
}
