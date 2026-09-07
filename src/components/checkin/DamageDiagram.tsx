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
  const s = "var(--text-subtle)";
  const body = "var(--surface-2)";
  const glass = "var(--surface)";
  const tyre = "var(--text-subtle)";
  const g = { stroke: s, strokeWidth: 0.7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  if (view === "top") {
    return (
      <g {...g}>
        {/* wheels */}
        <rect x={19} y={13} width={5} height={9} rx={2} fill={tyre} />
        <rect x={76} y={13} width={5} height={9} rx={2} fill={tyre} />
        <rect x={19} y={39} width={5} height={9} rx={2} fill={tyre} />
        <rect x={76} y={39} width={5} height={9} rx={2} fill={tyre} />
        {/* body */}
        <path
          d="M50 3
             C40 3 33 5 31 9
             C25 11 23 16 23 22
             L23 40 C23 47 26 52 31 54
             C34 56 42 57 50 57
             C58 57 66 56 69 54
             C74 52 77 47 77 40
             L77 22 C77 16 75 11 69 9
             C67 5 60 3 50 3 Z"
          fill={body}
        />
        {/* windshield / roof / rear window */}
        <path d="M35 14 L65 14 L61 24 L39 24 Z" fill={glass} />
        <rect x={38} y={25} width={24} height={12} rx={1.5} fill={glass} />
        <path d="M39 38 L61 38 L64 47 L36 47 Z" fill={glass} />
        {/* mirrors */}
        <path d="M23 20 l-3 -1.5 l0 3 z" fill={body} />
        <path d="M77 20 l3 -1.5 l0 3 z" fill={body} />
        {/* bonnet + boot creases */}
        <line x1={38} y1={9} x2={62} y2={9} />
        <line x1={38} y1={52} x2={62} y2={52} />
      </g>
    );
  }

  if (view === "front" || view === "rear") {
    const isFront = view === "front";
    return (
      <g {...g}>
        {/* wheels behind */}
        <rect x={16} y={40} width={9} height={10} rx={2.5} fill={tyre} />
        <rect x={75} y={40} width={9} height={10} rx={2.5} fill={tyre} />
        {/* cabin + roof */}
        <path d="M32 14 C32 10 36 8 50 8 C64 8 68 10 68 14 L68 22 L32 22 Z" fill={body} />
        <path d="M36 15 L64 15 L64 22 L36 22 Z" fill={glass} />
        {/* main body */}
        <path
          d="M18 22 L82 22 C85 22 86 24 86 27 L86 43 C86 46 84 47 81 47 L19 47 C16 47 14 46 14 43 L14 27 C14 24 15 22 18 22 Z"
          fill={body}
        />
        {/* headlights / taillights */}
        <rect x={20} y={26} width={14} height={6} rx={1.5} fill={isFront ? glass : "var(--tone-red-bg)"} />
        <rect x={66} y={26} width={14} height={6} rx={1.5} fill={isFront ? glass : "var(--tone-red-bg)"} />
        {/* grille / plate */}
        <rect x={40} y={27} width={20} height={7} rx={1} fill={glass} />
        {/* bumper */}
        <rect x={16} y={41} width={68} height={5} rx={2} fill={glass} />
      </g>
    );
  }

  // side profile (left / right) — mirrored for "right"
  const flip = view === "right";
  return (
    <g {...g} transform={flip ? "translate(100,0) scale(-1,1)" : undefined}>
      {/* body silhouette */}
      <path
        d="M8 40
           L14 40
           C15 34 18 32 24 31
           L30 22 C32 18 36 16 44 16
           L60 16 C66 16 70 18 73 23
           L86 27 C90 28 92 31 92 36
           L92 40 L86 40
           C86 45 82 48 78 48
           C74 48 70 45 70 40
           L30 40
           C30 45 26 48 22 48
           C18 48 14 45 14 40
           L8 40 Z"
        fill={body}
      />
      {/* greenhouse (windows) */}
      <path d="M34 22 L44 18 L58 18 L64 23 L64 30 L34 30 Z" fill={glass} />
      {/* window divider (B-pillar) */}
      <line x1={49} y1={19} x2={49} y2={30} />
      {/* doors */}
      <line x1={41} y1={30} x2={41} y2={40} />
      <line x1={58} y1={30} x2={58} y2={40} />
      {/* door handles */}
      <line x1={44} y1={33} x2={47} y2={33} strokeWidth={1.4} />
      <line x1={61} y1={33} x2={64} y2={33} strokeWidth={1.4} />
      {/* wheels + arches */}
      <circle cx={26} cy={40} r={7} fill={tyre} />
      <circle cx={26} cy={40} r={3} fill={body} />
      <circle cx={74} cy={40} r={7} fill={tyre} />
      <circle cx={74} cy={40} r={3} fill={body} />
      <path d="M18 40 A8 8 0 0 1 34 40" fill="none" />
      <path d="M66 40 A8 8 0 0 1 82 40" fill="none" />
      {/* side mirror */}
      <path d="M33 24 l-3 -2 l0 3 z" fill={body} />
    </g>
  );
}
