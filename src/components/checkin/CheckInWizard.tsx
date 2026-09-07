"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { submitCheckIn, type CheckInPayload } from "@/lib/actions/checkin";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { DamageDiagram, type DamageMarker } from "./DamageDiagram";
import { SignaturePad } from "./SignaturePad";
import { PhotoUploader, type UploadedPhoto } from "./PhotoUploader";
import { cn } from "@/lib/cn";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}
interface Vehicle {
  id: string;
  customer_id: string;
  label: string;
  plate: string | null;
}

const STEPS = ["Customer", "Vehicle", "Job details", "Condition", "Photos", "Sign-off", "Review"];

export function CheckInWizard({
  garageId,
  garageName,
  customers,
  vehicles,
  checklistItems,
  preselectCustomer,
  preselectVehicle,
}: {
  garageId: string;
  garageName: string;
  customers: Customer[];
  vehicles: Vehicle[];
  checklistItems: string[];
  preselectCustomer?: string;
  preselectVehicle?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const folder = React.useMemo(() => `checkin/${crypto.randomUUID()}`, []);

  const presetV = vehicles.find((v) => v.id === preselectVehicle);
  const [custMode, setCustMode] = React.useState<"existing" | "new">(
    preselectCustomer || presetV ? "existing" : "existing",
  );
  const [customerId, setCustomerId] = React.useState(preselectCustomer || presetV?.customer_id || "");
  const [newCust, setNewCust] = React.useState({ name: "", phone: "", email: "", address: "" });

  const [vehMode, setVehMode] = React.useState<"existing" | "new">(presetV ? "existing" : "existing");
  const [vehicleId, setVehicleId] = React.useState(preselectVehicle || "");
  const [newVeh, setNewVeh] = React.useState({
    make: "",
    model: "",
    year: "",
    license_plate: "",
    vin: "",
    engine_number: "",
    color: "",
    transmission: "",
    fuel_type: "",
  });

  const [job, setJob] = React.useState({
    priority: "normal" as "normal" | "urgent" | "emergency",
    complaint: "",
    requested_work: "",
    mileage_in: "",
    fuel_level_in: "50",
    expected_completion: "",
  });

  const [checklist, setChecklist] = React.useState(
    checklistItems.map((item) => ({ section: "Inspection", item, status: "ok", notes: "" })),
  );
  const [inspNotes, setInspNotes] = React.useState("");
  const [damages, setDamages] = React.useState<DamageMarker[]>([]);
  const [photos, setPhotos] = React.useState<UploadedPhoto[]>([]);
  const [custSig, setCustSig] = React.useState<string | null>(null);
  const [staffSig, setStaffSig] = React.useState<string | null>(null);

  const custVehicles = vehicles.filter((v) => v.customer_id === customerId);
  const statement = `I confirm the recorded condition, existing damage and mileage of this vehicle at check-in are accurate. I authorise ${garageName} to inspect the vehicle and perform the requested work.`;

  function canNext(): boolean {
    if (step === 0) return custMode === "existing" ? !!customerId : newCust.name.trim().length > 1;
    if (step === 1)
      return vehMode === "existing"
        ? !!vehicleId
        : Boolean(newVeh.make || newVeh.license_plate);
    if (step === 2) return job.complaint.trim().length > 2;
    return true;
  }

  async function submit() {
    setPending(true);
    const payload: CheckInPayload = {
      customer_id: custMode === "existing" ? customerId : null,
      customer: custMode === "new" ? newCust : undefined,
      vehicle_id: vehMode === "existing" ? vehicleId : null,
      vehicle: vehMode === "new" ? newVeh : undefined,
      priority: job.priority,
      complaint: job.complaint,
      requested_work: job.requested_work,
      mileage_in: job.mileage_in || undefined,
      fuel_level_in: job.fuel_level_in || undefined,
      expected_completion: job.expected_completion || undefined,
      inspection: {
        checklist,
        notes: inspNotes,
        damages: damages.map((d) => ({
          view: d.view,
          x: d.x,
          y: d.y,
          damage_type: d.damage_type,
          description: d.description,
          notes: d.notes,
        })),
      },
      photos: photos.map((p) => ({ url: p.url, category: p.category })),
      acknowledgement:
        custSig || staffSig
          ? { statement, customer_signature: custSig ?? undefined, staff_signature: staffSig ?? undefined }
          : undefined,
    };
    const res = await submitCheckIn(payload);
    if (res.error) {
      toast.push(res.error, "error");
      setPending(false);
      return;
    }
    toast.push("Vehicle checked in", "success");
    router.push(`/workshop/jobs/${res.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-5 flex flex-wrap gap-1 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={cn(
              "rounded-full px-2.5 py-1 font-medium",
              i === step
                ? "bg-brand text-brand-fg"
                : i < step
                  ? "bg-brand-soft text-brand"
                  : "bg-surface-2 text-text-subtle",
            )}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <Card>
        <CardBody>
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Toggle active={custMode === "existing"} onClick={() => setCustMode("existing")}>
                  Existing customer
                </Toggle>
                <Toggle active={custMode === "new"} onClick={() => setCustMode("new")}>
                  New customer
                </Toggle>
              </div>
              {custMode === "existing" ? (
                <Field label="Customer">
                  <Select value={customerId} onChange={(e) => (setCustomerId(e.target.value), setVehicleId(""))}>
                    <option value="">Select…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <Input value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} />
                  </Field>
                  <Field label="Phone">
                    <Input value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />
                  </Field>
                  <Field label="Email">
                    <Input value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} />
                  </Field>
                  <Field label="Address">
                    <Input value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} />
                  </Field>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Toggle
                  active={vehMode === "existing"}
                  onClick={() => setVehMode("existing")}
                  disabled={custMode === "new"}
                >
                  Existing vehicle
                </Toggle>
                <Toggle active={vehMode === "new"} onClick={() => setVehMode("new")}>
                  New vehicle
                </Toggle>
              </div>
              {vehMode === "existing" ? (
                custVehicles.length ? (
                  <Field label="Vehicle">
                    <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                      <option value="">Select…</option>
                      {custVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                          {v.plate ? ` · ${v.plate}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <p className="text-sm text-text-muted">
                    This customer has no vehicles on file — switch to “New vehicle”.
                  </p>
                )
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Make">
                    <Input value={newVeh.make} onChange={(e) => setNewVeh({ ...newVeh, make: e.target.value })} />
                  </Field>
                  <Field label="Model">
                    <Input value={newVeh.model} onChange={(e) => setNewVeh({ ...newVeh, model: e.target.value })} />
                  </Field>
                  <Field label="Year">
                    <Input value={newVeh.year} onChange={(e) => setNewVeh({ ...newVeh, year: e.target.value })} />
                  </Field>
                  <Field label="Plate">
                    <Input
                      value={newVeh.license_plate}
                      onChange={(e) => setNewVeh({ ...newVeh, license_plate: e.target.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label="VIN / chassis">
                    <Input value={newVeh.vin} onChange={(e) => setNewVeh({ ...newVeh, vin: e.target.value.toUpperCase() })} />
                  </Field>
                  <Field label="Engine no.">
                    <Input
                      value={newVeh.engine_number}
                      onChange={(e) => setNewVeh({ ...newVeh, engine_number: e.target.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label="Colour">
                    <Input value={newVeh.color} onChange={(e) => setNewVeh({ ...newVeh, color: e.target.value })} />
                  </Field>
                  <Field label="Transmission">
                    <Select
                      value={newVeh.transmission}
                      onChange={(e) => setNewVeh({ ...newVeh, transmission: e.target.value })}
                    >
                      <option value="">—</option>
                      <option>Automatic</option>
                      <option>Manual</option>
                      <option>CVT</option>
                    </Select>
                  </Field>
                  <Field label="Fuel">
                    <Select value={newVeh.fuel_type} onChange={(e) => setNewVeh({ ...newVeh, fuel_type: e.target.value })}>
                      <option value="">—</option>
                      <option>Petrol</option>
                      <option>Diesel</option>
                      <option>Hybrid</option>
                      <option>Electric</option>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field label="Customer complaint" hint="What is the customer reporting?">
                <Textarea value={job.complaint} onChange={(e) => setJob({ ...job, complaint: e.target.value })} rows={3} />
              </Field>
              <Field label="Requested work">
                <Textarea
                  value={job.requested_work}
                  onChange={(e) => setJob({ ...job, requested_work: e.target.value })}
                  rows={2}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Priority">
                  <Select
                    value={job.priority}
                    onChange={(e) => setJob({ ...job, priority: e.target.value as typeof job.priority })}
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </Select>
                </Field>
                <Field label="Mileage in (km)">
                  <Input
                    type="number"
                    value={job.mileage_in}
                    onChange={(e) => setJob({ ...job, mileage_in: e.target.value })}
                  />
                </Field>
                <Field label="Expected completion">
                  <Input
                    type="date"
                    value={job.expected_completion}
                    onChange={(e) => setJob({ ...job, expected_completion: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={`Fuel level — ${job.fuel_level_in}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={job.fuel_level_in}
                  onChange={(e) => setJob({ ...job, fuel_level_in: e.target.value })}
                  className="w-full accent-[var(--brand)]"
                />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-text">Inspection checklist</p>
                <div className="space-y-1">
                  {checklist.map((c, i) => (
                    <div key={c.item} className="flex items-center justify-between rounded bg-surface-2 px-2 py-1.5">
                      <span className="text-sm text-text">{c.item}</span>
                      <div className="flex gap-1">
                        {["ok", "attention", "n/a"].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setChecklist(checklist.map((x, xi) => (xi === i ? { ...x, status: s } : x)))
                            }
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-medium",
                              c.status === s
                                ? s === "attention"
                                  ? "bg-[var(--tone-amber-fg)] text-white"
                                  : s === "ok"
                                    ? "bg-[var(--tone-green-fg)] text-white"
                                    : "bg-border text-text"
                                : "bg-surface text-text-muted",
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-text">Damage diagram</p>
                <DamageDiagram markers={damages} onChange={setDamages} />
              </div>
              <Field label="Inspection notes">
                <Textarea value={inspNotes} onChange={(e) => setInspNotes(e.target.value)} rows={2} />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">
                Photograph the vehicle before work begins — this protects both the garage and the customer.
              </p>
              <PhotoUploader garageId={garageId} folder={folder} photos={photos} onChange={setPhotos} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="rounded-[var(--radius)] bg-surface-2 p-3 text-sm text-text-muted">{statement}</p>
              <SignaturePad label="Customer signature" value={custSig} onChange={setCustSig} />
              <SignaturePad label="Staff signature" value={staffSig} onChange={setStaffSig} />
              <p className="text-xs text-text-subtle">Signatures are optional but recommended.</p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-2 text-sm">
              <Row k="Customer" v={custMode === "existing" ? customers.find((c) => c.id === customerId)?.name : newCust.name} />
              <Row
                k="Vehicle"
                v={
                  vehMode === "existing"
                    ? custVehicles.find((v) => v.id === vehicleId)?.label
                    : `${newVeh.make} ${newVeh.model} ${newVeh.license_plate}`.trim()
                }
              />
              <Row k="Priority" v={job.priority} />
              <Row k="Complaint" v={job.complaint} />
              <Row k="Checklist flags" v={`${checklist.filter((c) => c.status === "attention").length} needs attention`} />
              <Row k="Damage markers" v={String(damages.length)} />
              <Row k="Photos" v={String(photos.length)} />
              <Row k="Signatures" v={[custSig && "customer", staffSig && "staff"].filter(Boolean).join(", ") || "none"} />
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending} data-tour="checkin-submit">
            {pending ? "Checking in…" : "Check in vehicle"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium disabled:opacity-40",
        active ? "bg-brand text-brand-fg" : "bg-surface-2 text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5">
      <span className="text-text-muted">{k}</span>
      <span className="text-right font-medium text-text">{v || "—"}</span>
    </div>
  );
}
