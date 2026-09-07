"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addTask, setTaskStatus, deleteTask, applyChecklistTemplate } from "@/lib/actions/workorders";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

interface Task {
  id: string;
  title: string;
  status: string;
  unable_reason: string | null;
  assigned_to: string | null;
  assignee: string | null;
}

const STATUS_CYCLE: Record<string, string> = {
  not_started: "in_progress",
  in_progress: "completed",
  completed: "not_started",
  unable: "not_started",
};
const LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Done",
  unable: "Can't complete",
};
const TONE: Record<string, string> = {
  not_started: "bg-surface-2 text-text-muted",
  in_progress: "bg-[var(--tone-violet-bg)] text-[var(--tone-violet-fg)]",
  completed: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]",
  unable: "bg-[var(--tone-red-bg)] text-[var(--tone-red-fg)]",
};

export function TasksPanel({
  woId,
  tasks,
  technicians,
  templates,
  canManage,
  currentUserId,
}: {
  woId: string;
  tasks: Task[];
  technicians: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [unableFor, setUnableFor] = React.useState<string | null>(null);
  const [unableReason, setUnableReason] = React.useState("");

  const done = tasks.filter((t) => t.status === "completed").length;

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

  async function cycle(t: Task) {
    const next = STATUS_CYCLE[t.status];
    if (next === "unable") return;
    await run(() => setTaskStatus(t.id, next));
  }

  return (
    <Card data-tour="tasks-panel">
      <CardHeader>
        <CardTitle>
          Repair tasks{" "}
          {tasks.length ? (
            <span className="ml-1 text-xs font-normal text-text-muted">
              {done}/{tasks.length} done
            </span>
          ) : null}
        </CardTitle>
        {canManage && templates.length ? (
          <select
            className="rounded border border-border bg-surface px-2 py-1 text-xs"
            defaultValue=""
            onChange={(e) => e.target.value && run(() => applyChecklistTemplate(woId, e.target.value))}
          >
            <option value="">Apply template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
      </CardHeader>
      <CardBody className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-text-muted">No tasks yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.map((t) => {
              const mine = t.assigned_to === currentUserId;
              return (
                <li key={t.id} className="rounded-[var(--radius)] bg-surface-2 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      disabled={pending || (!canManage && !mine)}
                      onClick={() => cycle(t)}
                      className="flex-1 text-left text-sm text-text disabled:opacity-70"
                    >
                      <span className={cn(t.status === "completed" && "text-text-muted line-through")}>{t.title}</span>
                    </button>
                    <span className={cn("rounded px-1.5 py-0.5 text-[0.7rem] font-medium", TONE[t.status])}>
                      {LABEL[t.status]}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-text-subtle">
                    <span>{t.assignee ?? "Unassigned"}</span>
                    <span className="flex gap-2">
                      {(canManage || mine) && t.status !== "unable" ? (
                        <button onClick={() => setUnableFor(t.id)} className="hover:underline">
                          Can&apos;t complete
                        </button>
                      ) : null}
                      {canManage ? (
                        <button
                          onClick={() => run(() => deleteTask(t.id))}
                          className="text-[var(--tone-red-fg)] hover:underline"
                        >
                          Delete
                        </button>
                      ) : null}
                    </span>
                  </div>
                  {t.unable_reason ? (
                    <p className="mt-1 text-xs italic text-[var(--tone-red-fg)]">{t.unable_reason}</p>
                  ) : null}
                  {unableFor === t.id ? (
                    <div className="mt-2 space-y-1">
                      <textarea
                        value={unableReason}
                        onChange={(e) => setUnableReason(e.target.value)}
                        placeholder="Why can't this be completed?"
                        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!unableReason.trim() || pending}
                          onClick={async () => {
                            await run(() => setTaskStatus(t.id, "unable", unableReason));
                            setUnableFor(null);
                            setUnableReason("");
                          }}
                        >
                          Mark unable
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setUnableFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {canManage ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task…"
              className="min-w-[8rem] flex-1 rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">Unassigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!title.trim() || pending}
              onClick={async () => {
                await run(() => addTask(woId, title, assignee || undefined));
                setTitle("");
              }}
            >
              Add
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
