"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { importServices, type ImportResult } from "@/lib/actions/services";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function ServicesImport({ hasServices }: { hasServices: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const res = await importServices(text);
      setResult(res);
      if (res.error) {
        toast.push(res.error, "error");
      } else {
        toast.push(
          `Imported — ${res.created ?? 0} added, ${res.updated ?? 0} updated${res.skipped ? `, ${res.skipped} skipped` : ""}`,
          "success",
        );
        router.refresh();
      }
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Bulk import</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        <p className="text-text-muted">
          Load your whole price list from a spreadsheet. Download the template, fill in one service per row,
          save as CSV, then upload it here. Rows whose <strong>name</strong> already exists are updated
          (price, category, minutes, description); new names are added. Nothing is deleted.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/settings/services/template?mode=template"
            className="rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            ⬇ Download template
          </a>
          {hasServices ? (
            <a
              href="/settings/services/template?mode=current"
              className="rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
            >
              ⬇ Export current list
            </a>
          ) : null}
          <label className="cursor-pointer rounded-[var(--radius)] bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-hover">
            {busy ? "Importing…" : "⬆ Upload CSV"}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>

        {result && !result.error ? (
          <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-3 text-xs">
            <p className="font-medium text-text">
              {result.created ?? 0} added · {result.updated ?? 0} updated
              {result.skipped ? ` · ${result.skipped} skipped` : ""}
            </p>
            {result.problems && result.problems.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--tone-amber-fg)]">
                {result.problems.slice(0, 12).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
                {result.problems.length > 12 ? <li>…and {result.problems.length - 12} more</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
