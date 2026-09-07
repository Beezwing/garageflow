"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveAppointment, setAppointmentStatus, deleteAppointment } from "@/lib/actions/appointments";
import { dateTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, CardBody, Badge, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

interface Appt {
  id: string;
  title: string | null;
  scheduled_at: string;
  status: string;
  notes: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  customer: { name: string } | null;
  vehicle: { make: string; model: string; license_plate: string } | null;
  service: { name: string } | null;
}

const STATUSES = ["scheduled", "confirmed", "arrived", "completed", "cancelled", "no_show"];
const TONE: Record<string, "gray" | "blue" | "green" | "amber" | "red" | "violet"> = {
  scheduled: "gray",
  confirmed: "blue",
  arrived: "violet",
  completed: "green",
  cancelled: "red",
  no_show: "amber",
};

export function AppointmentsClient({
  appointments,
  customers,
  vehicles,
  services,
}: {
  appointments: Appt[];
  customers: { id: string; name: string }[];
  vehicles: { id: string; customer_id: string; label: string }[];
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<Appt | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [custFilter, setCustFilter] = React.useState("");
  const [state, action, pending] = useActionState(saveAppointment, {});

  useEffect(() => {
    if (state.ok) {
      toast.push("Saved", "success");
      setEditing(null);
      setCreating(false);
      router.refresh();
    }
    if (state.error) toast.push(state.error, "error");
  }, [state, toast, router]);

  const target = editing ?? (creating ? ({} as Partial<Appt>) : null);
  const upcoming = appointments.filter((a) => !["completed", "cancelled", "no_show"].includes(a.status));
  const done = appointments.filter((a) => ["completed", "cancelled", "no_show"].includes(a.status));

  function card(a: Appt) {
    return (
      <Card key={a.id}>
        <CardBody className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-text">
                {a.title || a.service?.name || "Appointment"}
              </p>
              <p className="text-sm text-text-muted">
                {a.customer?.name ?? "—"}
                {a.vehicle ? ` · ${a.vehicle.make ?? ""} ${a.vehicle.model ?? ""} ${a.vehicle.license_plate ?? ""}`.trim() : ""}
              </p>
              <p className="text-xs text-text-subtle">{dateTime(a.scheduled_at)}</p>
            </div>
            <Badge tone={TONE[a.status]}>{a.status.replace("_", " ")}</Badge>
          </div>
          {a.notes ? <p className="text-sm text-text-muted">{a.notes}</p> : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <select
              value={a.status}
              onChange={async (e) => {
                await setAppointmentStatus(a.id, e.target.value);
                router.refresh();
              }}
              className="rounded border border-border bg-surface px-2 py-1 text-xs"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            {a.customer_id ? (
              <Link
                href={`/workshop/check-in?customer=${a.customer_id}${a.vehicle_id ? `&vehicle=${a.vehicle_id}` : ""}`}
                className="rounded bg-brand px-2 py-1 text-xs font-medium text-brand-fg"
              >
                Start check-in
              </Link>
            ) : null}
            <button onClick={() => setEditing(a)} className="text-xs text-brand hover:underline">
              Edit
            </button>
            <button
              onClick={async () => {
                await deleteAppointment(a.id);
                router.refresh();
              }}
              className="text-xs text-[var(--tone-red-fg)]"
            >
              Delete
            </button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Button onClick={() => setCreating(true)} data-tour="new-appointment">
        New appointment
      </Button>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing booked.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">{upcoming.map(card)}</div>
        )}
      </section>

      {done.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Past</h2>
          <div className="grid gap-3 sm:grid-cols-2">{done.map(card)}</div>
        </section>
      ) : null}

      <Modal
        open={target !== null}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        title={editing ? "Edit appointment" : "New appointment"}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" form="appt-form" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {target !== null ? (
          <form id="appt-form" action={action} className="space-y-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Customer">
              <Select
                name="customer_id"
                defaultValue={editing?.customer_id ?? ""}
                onChange={(e) => setCustFilter(e.target.value)}
              >
                <option value="">—</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vehicle">
              <Select name="vehicle_id" defaultValue={editing?.vehicle_id ?? ""}>
                <option value="">—</option>
                {vehicles
                  .filter((v) => !custFilter || v.customer_id === custFilter || v.id === editing?.vehicle_id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Service">
              <Select name="service_id" defaultValue="">
                <option value="">—</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title / reason">
              <Input name="title" defaultValue={editing?.title ?? ""} placeholder="Oil change" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Date">
                <Input
                  name="date"
                  type="date"
                  required
                  defaultValue={editing ? editing.scheduled_at.slice(0, 10) : ""}
                />
              </Field>
              <Field label="Time">
                <Input
                  name="time"
                  type="time"
                  defaultValue={editing ? editing.scheduled_at.slice(11, 16) : "09:00"}
                />
              </Field>
              <Field label="Duration (min)">
                <Input name="duration_min" type="number" defaultValue={60} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
            </Field>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
