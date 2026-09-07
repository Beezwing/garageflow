"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/status";

export function JobsFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const cls = "rounded-[var(--radius)] border border-border bg-surface px-2 py-2 text-sm";

  return (
    <div className="flex flex-wrap gap-2">
      <select className={cls} value={params.get("scope") ?? "open"} onChange={(e) => set("scope", e.target.value)}>
        <option value="open">Open jobs</option>
        <option value="all">All jobs</option>
        <option value="closed">Closed</option>
      </select>
      <select className={cls} value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
        <option value="">Any status</option>
        {Object.entries(WORK_ORDER_STATUS_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <select className={cls} value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
        <option value="">Any priority</option>
        <option value="normal">Normal</option>
        <option value="urgent">Urgent</option>
        <option value="emergency">Emergency</option>
      </select>
    </div>
  );
}
