"use client";

import * as React from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { SafetyTip } from "@/lib/actions/safety";

const TONE: Record<string, string> = {
  critical: "border-[var(--tone-red-fg)] bg-[var(--tone-red-bg)] text-[var(--tone-red-fg)]",
  warning: "border-[var(--tone-amber-fg)] bg-[var(--tone-amber-bg)] text-[var(--tone-amber-fg)]",
  info: "border-border bg-surface-2 text-text-muted",
};
const ICON: Record<string, string> = { critical: "🚨", warning: "⚠️", info: "🦺" };

/**
 * Dismissible safety popup for technicians. Shows once per `dedupeKey`
 * (per browser) — pass the work-order id on a job page, or a per-day key.
 */
export function SafetyReminder({
  tips,
  dedupeKey,
  heading = "Before you start — stay safe",
  max = 4,
}: {
  tips: SafetyTip[];
  dedupeKey: string;
  heading?: string;
  max?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const storageKey = `gf-safety-ack-${dedupeKey}`;

  React.useEffect(() => {
    if (!tips.length) return;
    let acked = false;
    try {
      acked = localStorage.getItem(storageKey) === "1";
    } catch {
      acked = false;
    }
    if (!acked) setOpen(true);
  }, [tips.length, storageKey]);

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!tips.length) return null;

  const shown = tips.slice(0, max);

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={heading}
      description="A quick reminder before this job. Read it, then tap “Got it”."
      footer={
        <>
          <Link href="/safety" className="self-center text-xs text-text-muted hover:text-text">
            All safety tips
          </Link>
          <Button onClick={dismiss}>Got it — start work</Button>
        </>
      }
    >
      <ul className="space-y-2">
        {shown.map((t) => (
          <li key={t.id} className={`rounded-[var(--radius)] border px-3 py-2 ${TONE[t.severity] ?? TONE.info}`}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span>{ICON[t.severity] ?? "🦺"}</span>
              {t.title}
              {t.category ? <span className="ml-1 text-[0.7rem] font-normal opacity-70">· {t.category}</span> : null}
            </p>
            <p className="mt-0.5 text-sm text-text">{t.body}</p>
          </li>
        ))}
      </ul>
      {tips.length > shown.length ? (
        <p className="mt-2 text-xs text-text-subtle">
          +{tips.length - shown.length} more on the{" "}
          <Link href="/safety" className="text-brand hover:underline">
            safety page
          </Link>
          .
        </p>
      ) : null}
    </Modal>
  );
}
