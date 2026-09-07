"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { assignTechnician, unassignTechnician } from "@/lib/actions/workorders";
import { ROLE_LABELS } from "@/lib/permissions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface Assignment {
  id: string;
  technician_id: string;
  name: string;
  scope: string | null;
  time: string;
}

export function AssignPanel({
  woId,
  assignments,
  technicians,
  canManage,
}: {
  woId: string;
  assignments: Assignment[];
  technicians: { id: string; name: string; role: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tech, setTech] = React.useState("");
  const [scope, setScope] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const assignedIds = new Set(assignments.map((a) => a.technician_id));
  const available = technicians.filter((t) => !assignedIds.has(t.id));

  async function add() {
    if (!tech) return;
    setPending(true);
    try {
      await assignTechnician(woId, tech, scope || undefined);
      toast.push("Technician assigned", "success");
      setTech("");
      setScope("");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <Card data-tour="assign-panel">
      <CardHeader>
        <CardTitle>Technicians</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {assignments.length === 0 ? (
          <p className="text-sm text-text-muted">No one assigned yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 rounded-[var(--radius)] bg-surface-2 px-2.5 py-2">
                <div>
                  <p className="text-sm font-medium text-text">{a.name}</p>
                  <p className="text-xs text-text-muted">
                    {a.scope || "General"} · {a.time}
                  </p>
                </div>
                {canManage ? (
                  <button
                    onClick={async () => {
                      await unassignTechnician(a.id);
                      router.refresh();
                    }}
                    className="text-xs text-[var(--tone-red-fg)] hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage && available.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <select
              value={tech}
              onChange={(e) => setTech(e.target.value)}
              className="w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">Add technician…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({ROLE_LABELS[t.role as keyof typeof ROLE_LABELS]})
                </option>
              ))}
            </select>
            <input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Scope (e.g. Engine, A/C)"
              className="w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <Button size="sm" className="w-full" disabled={!tech || pending} onClick={add}>
              Assign
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
