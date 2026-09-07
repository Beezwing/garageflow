"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveChecklist } from "@/lib/actions/checklists";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function ChecklistEditor({
  kind,
  title,
  name,
  items,
}: {
  kind: string;
  title: string;
  name: string;
  items: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = React.useState(items);
  const [pending, setPending] = React.useState(false);
  const dirty = JSON.stringify(list) !== JSON.stringify(items);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  }

  async function save() {
    setPending(true);
    try {
      await saveChecklist(kind, name, list);
      toast.push("Checklist saved", "success");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-xs text-text-subtle">{list.length} items</span>
      </CardHeader>
      <CardBody className="space-y-2">
        {list.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={item}
              onChange={(e) => setList(list.map((x, xi) => (xi === i ? e.target.value : x)))}
              className="flex-1 rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <button onClick={() => move(i, -1)} className="text-xs text-text-muted hover:text-text" aria-label="Move up">
              ▲
            </button>
            <button onClick={() => move(i, 1)} className="text-xs text-text-muted hover:text-text" aria-label="Move down">
              ▼
            </button>
            <button
              onClick={() => setList(list.filter((_, xi) => xi !== i))}
              className="text-xs text-[var(--tone-red-fg)]"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="secondary" onClick={() => setList([...list, ""])}>
            + Add item
          </Button>
          <Button size="sm" disabled={pending || !dirty} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
