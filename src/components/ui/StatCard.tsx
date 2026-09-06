import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Card } from "./primitives";

export function StatCard({
  label,
  value,
  sub,
  href,
  tone = "gray",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  href?: string;
  tone?: "gray" | "blue" | "amber" | "violet" | "green" | "red";
  className?: string;
}) {
  const body = (
    <Card
      className={cn(
        "p-4 transition-colors",
        href && "hover:border-brand",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: `var(--tone-${tone}-fg)` }}
        />
      </div>
      <p className="mt-2 text-2xl font-semibold text-text tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-text-muted">{sub}</p> : null}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
