"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PRESETS: [string, number][] = [
  ["7d", 7],
  ["30d", 30],
  ["90d", 90],
  ["365d", 365],
];

export function ReportControls() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("range") ?? "30d";

  function set(range: string) {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set("range", range);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(([k, n]) => (
        <button
          key={k}
          onClick={() => set(k)}
          className={`rounded-[var(--radius)] px-2.5 py-1.5 text-sm font-medium ${
            active === k ? "bg-brand text-brand-fg" : "bg-surface-2 text-text-muted hover:text-text"
          }`}
        >
          Last {n} days
        </button>
      ))}
      <a
        href={`/reports/export?range=${active}`}
        className="ml-auto rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        Download CSV
      </a>
    </div>
  );
}
