"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Hit {
  group: string;
  label: string;
  sub?: string;
  href: string;
}

export function GlobalSearch({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [i, setI] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ("");
      setHits([]);
    }
  }, [open]);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      const sb = createClient();
      const like = `%${term}%`;
      const [cust, veh, wo, inv, parts] = await Promise.all([
        sb.from("customers").select("id, name, phone").is("deleted_at", null).or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(5),
        sb.from("vehicles").select("id, make, model, license_plate, vin").is("deleted_at", null).or(`license_plate.ilike.${like},vin.ilike.${like},engine_number.ilike.${like},make.ilike.${like},model.ilike.${like}`).limit(5),
        sb.from("work_orders").select("id, number, complaint").ilike("number", like).limit(5),
        sb.from("invoices").select("id, number").ilike("number", like).limit(5),
        sb.from("parts").select("id, name, part_number").is("deleted_at", null).or(`name.ilike.${like},part_number.ilike.${like}`).limit(5),
      ]);
      const out: Hit[] = [];
      (cust.data ?? []).forEach((r) =>
        out.push({ group: "Customers", label: r.name as string, sub: (r.phone as string) ?? "", href: `/customers/${r.id}` }),
      );
      (veh.data ?? []).forEach((r) =>
        out.push({
          group: "Vehicles",
          label: `${r.make ?? ""} ${r.model ?? ""}`.trim() || "Vehicle",
          sub: [(r.license_plate as string), (r.vin as string)].filter(Boolean).join(" · "),
          href: `/vehicles/${r.id}`,
        }),
      );
      (wo.data ?? []).forEach((r) =>
        out.push({ group: "Jobs", label: r.number as string, sub: (r.complaint as string) ?? "", href: `/workshop/jobs/${r.id}` }),
      );
      (inv.data ?? []).forEach((r) => out.push({ group: "Invoices", label: r.number as string, href: `/billing/invoices/${r.id}` }));
      (parts.data ?? []).forEach((r) =>
        out.push({ group: "Parts", label: r.name as string, sub: (r.part_number as string) ?? "", href: `/inventory/parts/${r.id}` }),
      );
      setHits(out);
      setI(0);
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(h: Hit) {
    setOpen(false);
    router.push(h.href);
  }

  return (
    <>
      {iconOnly ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="grid h-10 w-10 place-items-center rounded-[var(--radius)] border border-border text-text-muted"
        >
          🔍
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-2.5 py-2 text-sm text-text-subtle hover:text-text"
        >
          <span>🔍</span>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border px-1 text-[0.65rem]">⌘K</kbd>
        </button>
      )}

      {open ? (
        <div className="fixed inset-0 z-[95] flex items-start justify-center bg-black/40 p-3 pt-[8vh] sm:p-4 sm:pt-[12vh]">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setI((n) => Math.min(hits.length - 1, n + 1));
                if (e.key === "ArrowUp") setI((n) => Math.max(0, n - 1));
                if (e.key === "Enter" && hits[i]) go(hits[i]);
              }}
              placeholder="Customer, plate, VIN, job #, invoice #, part…"
              className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text outline-none"
            />
            <div className="max-h-[50vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-text-subtle">Type at least 2 characters</p>
              ) : busy && hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-subtle">Searching…</p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-subtle">Nothing found</p>
              ) : (
                hits.map((h, n) => (
                  <button
                    key={h.href}
                    onClick={() => go(h)}
                    onMouseEnter={() => setI(n)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm sm:py-2 ${
                      n === i ? "bg-surface-2" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-text">{h.label}</span>
                      {h.sub ? <span className="ml-2 truncate text-xs text-text-muted">{h.sub}</span> : null}
                    </span>
                    <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-text-subtle">{h.group}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
