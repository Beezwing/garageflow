"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { respondToAppointmentRequest } from "@/lib/actions/appointments";
import { dateTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, CardBody, Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export interface ApptRequest {
  id: string;
  title: string | null;
  request_state: string;
  preferred_at: string;
  proposed_at: string | null;
  customer_note: string | null;
  staff_note: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  customer: { name: string } | null;
  vehicle: { make: string; model: string; year: number | null; license_plate: string } | null;
  photos: string[];
}

export function AppointmentRequests({ requests }: { requests: ApptRequest[] }) {
  const router = useRouter();
  const toast = useToast();
  const [proposeFor, setProposeFor] = React.useState<ApptRequest | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [propose, setPropose] = React.useState({ date: "", time: "09:00", note: "" });

  async function confirm(a: ApptRequest) {
    setBusyId(a.id);
    try {
      await respondToAppointmentRequest(a.id, "confirm");
      toast.push("Appointment confirmed — customer notified", "success");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setBusyId(null);
  }

  async function submitPropose() {
    if (!proposeFor || !propose.date) {
      toast.push("Pick a date and time to propose.", "error");
      return;
    }
    setBusyId(proposeFor.id);
    try {
      await respondToAppointmentRequest(proposeFor.id, "propose", {
        proposed_at: new Date(`${propose.date}T${propose.time || "09:00"}`).toISOString(),
        staff_note: propose.note || undefined,
      });
      toast.push("New time suggested — customer notified", "success");
      setProposeFor(null);
      setPropose({ date: "", time: "09:00", note: "" });
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setBusyId(null);
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Appointment requests <span className="text-[var(--tone-amber-fg)]">({requests.length})</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {requests.map((a) => {
          const v = a.vehicle;
          const waiting = a.request_state === "proposed";
          return (
            <Card key={a.id} className={waiting ? "" : "border-[var(--tone-amber-fg)]"}>
              <CardBody className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-text">{a.title || "Repair request"}</p>
                    <p className="text-sm text-text-muted">
                      {a.contact_name || a.customer?.name || "—"}
                      {a.contact_phone ? ` · ${a.contact_phone}` : ""}
                    </p>
                    <p className="text-xs text-text-subtle">
                      {v ? `${[v.year, v.make, v.model].filter(Boolean).join(" ")}` : "Vehicle t.b.c."}
                      {v?.license_plate ? ` · ${v.license_plate}` : ""}
                    </p>
                  </div>
                  <Badge tone={waiting ? "blue" : "amber"}>{waiting ? "awaiting customer" : "new"}</Badge>
                </div>

                <div className="text-sm">
                  <span className="text-text-subtle">Preferred: </span>
                  <span className="text-text">{dateTime(a.preferred_at)}</span>
                  {a.proposed_at ? (
                    <>
                      <br />
                      <span className="text-text-subtle">You proposed: </span>
                      <span className="text-text">{dateTime(a.proposed_at)}</span>
                    </>
                  ) : null}
                </div>

                {a.customer_note ? (
                  <p className="rounded-[var(--radius)] bg-surface-2 px-3 py-2 text-sm text-text-muted">{a.customer_note}</p>
                ) : null}

                {a.photos.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {a.photos.map((src) => (
                      <a key={src} href={src} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="aspect-square w-full rounded border border-border object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}

                {!waiting ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" disabled={busyId === a.id} onClick={() => confirm(a)}>
                      {busyId === a.id ? "…" : "Confirm this time"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === a.id}
                      onClick={() => {
                        setProposeFor(a);
                        setPropose({ date: a.preferred_at.slice(0, 10), time: "09:00", note: "" });
                      }}
                    >
                      Suggest another time
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <p className="text-xs text-text-subtle">Waiting for the customer to accept your proposed time.</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === a.id}
                      onClick={() => {
                        setProposeFor(a);
                        setPropose({ date: a.proposed_at?.slice(0, 10) ?? "", time: a.proposed_at?.slice(11, 16) ?? "09:00", note: "" });
                      }}
                    >
                      Change proposal
                    </Button>
                  </div>
                )}
                {a.customer_id ? (
                  <a
                    href={`/workshop/check-in?customer=${a.customer_id}${a.vehicle_id ? `&vehicle=${a.vehicle_id}` : ""}`}
                    className="inline-block text-xs text-brand hover:underline"
                  >
                    Skip ahead — check this vehicle in now
                  </a>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Modal
        open={proposeFor !== null}
        onClose={() => setProposeFor(null)}
        title="Suggest a different time"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProposeFor(null)} disabled={!!busyId}>
              Cancel
            </Button>
            <Button onClick={submitPropose} disabled={!!busyId}>
              {busyId ? "Sending…" : "Send proposal"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={propose.date} onChange={(e) => setPropose({ ...propose, date: e.target.value })} />
            </Field>
            <Field label="Time">
              <Input type="time" value={propose.time} onChange={(e) => setPropose({ ...propose, time: e.target.value })} />
            </Field>
          </div>
          <Field label="Note to customer" hint="Optional — e.g. why this time works better.">
            <Textarea rows={2} value={propose.note} onChange={(e) => setPropose({ ...propose, note: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </section>
  );
}
