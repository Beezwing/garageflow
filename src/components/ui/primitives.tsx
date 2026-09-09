import * as React from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------- Card --------------------------------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius)] border border-border bg-surface", className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 border-b border-border px-4 py-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-text", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

/* --------------------------------- Badge --------------------------------- */
type Tone = "gray" | "blue" | "amber" | "violet" | "green" | "red";
export function Badge({
  tone = "gray",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        background: `var(--tone-${tone}-bg)`,
        color: `var(--tone-${tone}-fg)`,
      }}
      {...props}
    />
  );
}

/* -------------------------------- Inputs --------------------------------- */
const field =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(field, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-20", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, "h-10 pr-8", className)} {...props} />
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-text", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-[var(--tone-red-fg)]">{error}</p> : null}
    </div>
  );
}

/* ------------------------------ Page header ------------------------------ */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-text">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------ Empty state ------------------------------ */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-surface px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-text-subtle">{icon}</div> : null}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------- Table ---------------------------------- */
export function TableWrap({
  className,
  cards,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { cards?: boolean }) {
  return (
    <div
      className={cn(
        "gf-scroll overflow-x-auto rounded-[var(--radius)] border border-border bg-surface",
        // in card mode the rows are their own cards on mobile — drop the wrapper chrome
        cards && "max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-full text-sm", className)} {...props} />;
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted",
        className,
      )}
      {...props}
    />
  );
}
export function Td({
  className,
  label,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { label?: string }) {
  return (
    <td
      data-label={label}
      className={cn("border-b border-border px-3 py-2.5 align-middle text-text", className)}
      {...props}
    />
  );
}

/* ------------------------------- Divider -------------------------------- */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}
