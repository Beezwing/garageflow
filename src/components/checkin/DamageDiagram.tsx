"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface DamageMarker {
  id: string;
  view: string;
  x: number; // 0..1
  y: number; // 0..1
  damage_type: string;
  description?: string;
  notes?: string;
}

const DAMAGE_TYPES = [
  "dent",
  "scratch",
  "crack",
  "broken",
  "missing",
  "paint damage",
  "rust",
  "mechanical",
  "other",
];

const VIEWS = [
  { key: "top", label: "Top" },
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
];

export function DamageDiagram({
  markers,
  onChange,
}: {
  markers: DamageMarker[];
  onChange: (m: DamageMarker[]) => void;
}) {
  const [view, setView] = React.useState("top");
  const [active, setActive] = React.useState<string | null>(null);
  const ref = React.useRef<SVGSVGElement>(null);

  function place(e: React.MouseEvent<SVGSVGElement>) {
    const rect = ref.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const marker: DamageMarker = {
      id: crypto.randomUUID(),
      view,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      damage_type: "scratch",
    };
    onChange([...markers, marker]);
    setActive(marker.id);
  }

  function update(id: string, patch: Partial<DamageMarker>) {
    onChange(markers.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function remove(id: string) {
    onChange(markers.filter((m) => m.id !== id));
    if (active === id) setActive(null);
  }

  const viewMarkers = markers.filter((m) => m.view === view);
  const activeMarker = markers.find((m) => m.id === active) ?? null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={cn(
              "rounded-[var(--radius)] px-2.5 py-1 text-xs font-medium",
              view === v.key ? "bg-brand text-brand-fg" : "bg-surface-2 text-text-muted hover:text-text",
            )}
          >
            {v.label}
            {markers.filter((m) => m.view === v.key).length > 0 ? (
              <span className="ml-1 opacity-70">({markers.filter((m) => m.view === v.key).length})</span>
            ) : null}
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs text-text-muted">Tap the diagram to drop a damage marker.</p>

      <div className="rounded-[var(--radius)] border border-border bg-surface p-3">
        <svg
          ref={ref}
          viewBox="0 0 100 60"
          onClick={place}
          className="w-full cursor-crosshair select-none"
          style={{ maxHeight: 260 }}
        >
          <CarShape view={view} />
          {viewMarkers.map((m) => (
            <g key={m.id} onClick={(e) => (e.stopPropagation(), setActive(m.id))} className="cursor-pointer">
              <circle
                cx={m.x * 100}
                cy={m.y * 60}
                r={active === m.id ? 2.6 : 2}
                fill="var(--tone-red-fg)"
                stroke="#fff"
                strokeWidth={0.5}
              />
            </g>
          ))}
        </svg>
      </div>

      {activeMarker ? (
        <div className="mt-3 rounded-[var(--radius)] border border-border bg-surface-2 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-text">
              Type
              <select
                value={activeMarker.damage_type}
                onChange={(e) => update(activeMarker.id, { damage_type: e.target.value })}
                className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
              >
                {DAMAGE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-text">
              Description
              <input
                value={activeMarker.description ?? ""}
                onChange={(e) => update(activeMarker.id, { description: e.target.value })}
                className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
                placeholder="e.g. deep scratch on door"
              />
            </label>
          </div>
          <div className="mt-2 flex justify-between">
            <button
              type="button"
              onClick={() => remove(activeMarker.id)}
              className="text-xs text-[var(--tone-red-fg)] hover:underline"
            >
              Remove marker
            </button>
            <button type="button" onClick={() => setActive(null)} className="text-xs text-text-muted hover:underline">
              Done
            </button>
          </div>
        </div>
      ) : null}

      {markers.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {markers.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded bg-surface-2 px-2 py-1">
              <span className="text-text-muted">
                <span className="font-medium capitalize text-text">{m.damage_type}</span> · {m.view}
                {m.description ? ` — ${m.description}` : ""}
              </span>
              <button type="button" onClick={() => remove(m.id)} className="text-xs text-[var(--tone-red-fg)]">
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CarShape({ view }: { view: string }) {
  const stroke = "var(--text-subtle)";
  const fill = "var(--surface-2)";
  if (view === "top") {
    return (
      <g stroke={stroke} strokeWidth={0.6} fill={fill}>
        <rect x={28} y={6} width={44} height={48} rx={10} />
        <rect x={33} y={12} width={34} height={13} rx={3} fill="var(--surface)" />
        <rect x={33} y={34} width={34} height={14} rx={3} fill="var(--surface)" />
        <line x1={28} y1={30} x2={72} y2={30} />
      </g>
    );
  }
  if (view === "front" || view === "rear") {
    return (
      <g stroke={stroke} strokeWidth={0.6} fill={fill}>
        <rect x={22} y={18} width={56} height={26} rx={5} />
        <rect x={30} y={22} width={40} height={12} rx={2} fill="var(--surface)" />
        <circle cx={32} cy={45} r={4} fill="var(--text-subtle)" />
        <circle cx={68} cy={45} r={4} fill="var(--text-subtle)" />
      </g>
    );
  }
  // left / right
  return (
    <g stroke={stroke} strokeWidth={0.6} fill={fill}>
      <path d="M12 40 L20 40 Q24 22 40 20 L64 20 Q76 22 82 34 L88 36 L88 42 L12 42 Z" />
      <circle cx={30} cy={42} r={5} fill="var(--text-subtle)" />
      <circle cx={72} cy={42} r={5} fill="var(--text-subtle)" />
      <path d="M40 21 L44 33 L64 33 L62 21 Z" fill="var(--surface)" />
    </g>
  );
}
