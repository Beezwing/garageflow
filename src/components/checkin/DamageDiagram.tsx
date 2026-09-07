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

export const DAMAGE_TYPES: { key: string; label: string; color: string }[] = [
  { key: "dent", label: "Dent", color: "#e5484d" },
  { key: "scratch", label: "Scratch", color: "#f76808" },
  { key: "crack", label: "Crack", color: "#f5d90a" },
  { key: "broken", label: "Broken", color: "#8e4ec6" },
  { key: "missing", label: "Missing", color: "#8b8d98" },
  { key: "paint damage", label: "Paint damage", color: "#0091ff" },
  { key: "rust", label: "Rust", color: "#a5643c" },
  { key: "mechanical", label: "Mechanical", color: "#30a46c" },
  { key: "other", label: "Other", color: "#4b5563" },
];
const colorFor = (t: string) => DAMAGE_TYPES.find((d) => d.key === t)?.color ?? "#4b5563";

const VIEWS = [
  { key: "top", label: "Top / roof" },
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "left", label: "Left side" },
  { key: "right", label: "Right side" },
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
  const boxRef = React.useRef<HTMLDivElement>(null);

  function place(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-marker]")) return;
    const rect = boxRef.current!.getBoundingClientRect();
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

  const update = (id: string, patch: Partial<DamageMarker>) =>
    onChange(markers.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id: string) => {
    onChange(markers.filter((m) => m.id !== id));
    if (active === id) setActive(null);
  };

  const viewMarkers = markers.filter((m) => m.view === view);
  const activeMarker = markers.find((m) => m.id === active) ?? null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {VIEWS.map((v) => {
          const n = markers.filter((m) => m.view === v.key).length;
          return (
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
              {n > 0 ? <span className="ml-1 opacity-70">({n})</span> : null}
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-xs text-text-muted">Tap the vehicle to drop a marker, then set the damage type.</p>

      <div className="rounded-[var(--radius)] border border-border bg-surface p-2">
        {/* wrapper is exactly the image box, so marker %s map straight onto it */}
        <div
          ref={boxRef}
          onClick={place}
          style={{ maxWidth: view === "top" ? 300 : 480 }}
          className="relative mx-auto w-full cursor-crosshair select-none"
        >
          <VehicleImage key={view} view={view} />

          {viewMarkers.map((m) => (
            <button
              key={m.id}
              data-marker
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActive(m.id);
              }}
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, background: colorFor(m.damage_type) }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
                active === m.id ? "h-5 w-5" : "h-4 w-4",
              )}
              title={m.damage_type}
            />
          ))}
        </div>
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
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-text">
              Description
              <input
                value={activeMarker.description ?? ""}
                onChange={(e) => update(activeMarker.id, { description: e.target.value })}
                className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
                placeholder="e.g. deep scratch, driver door"
              />
            </label>
          </div>
          <div className="mt-2 flex justify-between">
            <button type="button" onClick={() => remove(activeMarker.id)} className="text-xs text-[var(--tone-red-fg)] hover:underline">
              Remove marker
            </button>
            <button type="button" onClick={() => setActive(null)} className="text-xs text-text-muted hover:underline">
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {DAMAGE_TYPES.map((t) => (
          <span key={t.key} className="flex items-center gap-1 text-[0.7rem] text-text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
            {t.label}
          </span>
        ))}
      </div>

      {markers.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {markers.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded bg-surface-2 px-2 py-1">
              <span className="text-text-muted">
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorFor(m.damage_type) }} />
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

/* ---------- background: /vehicle/{view}.png → .svg → inline vector ---------- */
function VehicleImage({ view }: { view: string }) {
  const [src, setSrc] = React.useState(`/vehicle/${view}.png`);
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <svg viewBox="0 0 100 66" className="pointer-events-none block w-full">
        <CarShape view={view} />
      </svg>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${view} view`}
      draggable={false}
      className="pointer-events-none block w-full"
      onError={() => {
        if (src.endsWith(".png")) setSrc(`/vehicle/${view}.svg`);
        else setFailed(true);
      }}
    />
  );
}

/* ---------- inline vector fallback ---------- */
function CarShape({ view }: { view: string }) {
  const s = "var(--text-subtle)";
  const body = "var(--surface-2)";
  const glass = "var(--surface)";
  const tyre = "var(--text-subtle)";
  const g = { stroke: s, strokeWidth: 0.7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  if (view === "top") {
    return (
      <g {...g} transform="translate(0,3)">
        <rect x={19} y={13} width={5} height={9} rx={2} fill={tyre} />
        <rect x={76} y={13} width={5} height={9} rx={2} fill={tyre} />
        <rect x={19} y={39} width={5} height={9} rx={2} fill={tyre} />
        <rect x={76} y={39} width={5} height={9} rx={2} fill={tyre} />
        <path
          d="M50 3 C40 3 33 5 31 9 C25 11 23 16 23 22 L23 40 C23 47 26 52 31 54 C34 56 42 57 50 57 C58 57 66 56 69 54 C74 52 77 47 77 40 L77 22 C77 16 75 11 69 9 C67 5 60 3 50 3 Z"
          fill={body}
        />
        <path d="M35 14 L65 14 L61 24 L39 24 Z" fill={glass} />
        <rect x={38} y={25} width={24} height={12} rx={1.5} fill={glass} />
        <path d="M39 38 L61 38 L64 47 L36 47 Z" fill={glass} />
        <path d="M23 20 l-3 -1.5 l0 3 z" fill={body} />
        <path d="M77 20 l3 -1.5 l0 3 z" fill={body} />
      </g>
    );
  }
  if (view === "front" || view === "rear") {
    const isFront = view === "front";
    return (
      <g {...g} transform="translate(0,6)">
        <rect x={16} y={40} width={9} height={10} rx={2.5} fill={tyre} />
        <rect x={75} y={40} width={9} height={10} rx={2.5} fill={tyre} />
        <path d="M32 14 C32 10 36 8 50 8 C64 8 68 10 68 14 L68 22 L32 22 Z" fill={body} />
        <path d="M36 15 L64 15 L64 22 L36 22 Z" fill={glass} />
        <path d="M18 22 L82 22 C85 22 86 24 86 27 L86 43 C86 46 84 47 81 47 L19 47 C16 47 14 46 14 43 L14 27 C14 24 15 22 18 22 Z" fill={body} />
        <rect x={20} y={26} width={14} height={6} rx={1.5} fill={isFront ? glass : "var(--tone-red-bg)"} />
        <rect x={66} y={26} width={14} height={6} rx={1.5} fill={isFront ? glass : "var(--tone-red-bg)"} />
        <rect x={40} y={27} width={20} height={7} rx={1} fill={glass} />
        <rect x={16} y={41} width={68} height={5} rx={2} fill={glass} />
      </g>
    );
  }
  const flip = view === "right";
  return (
    <g {...g} transform={flip ? "translate(100,6) scale(-1,1)" : "translate(0,6)"}>
      <path
        d="M8 40 L14 40 C15 34 18 32 24 31 L30 22 C32 18 36 16 44 16 L60 16 C66 16 70 18 73 23 L86 27 C90 28 92 31 92 36 L92 40 L86 40 C86 45 82 48 78 48 C74 48 70 45 70 40 L30 40 C30 45 26 48 22 48 C18 48 14 45 14 40 L8 40 Z"
        fill={body}
      />
      <path d="M34 22 L44 18 L58 18 L64 23 L64 30 L34 30 Z" fill={glass} />
      <line x1={49} y1={19} x2={49} y2={30} />
      <line x1={41} y1={30} x2={41} y2={40} />
      <line x1={58} y1={30} x2={58} y2={40} />
      <circle cx={26} cy={40} r={7} fill={tyre} />
      <circle cx={26} cy={40} r={3} fill={body} />
      <circle cx={74} cy={40} r={7} fill={tyre} />
      <circle cx={74} cy={40} r={3} fill={body} />
    </g>
  );
}
