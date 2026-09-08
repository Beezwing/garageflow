"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { requestAppointment } from "@/lib/actions/portal";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type Pic = { file: File; preview: string };

export function BookingForm({
  garageId,
  garageName,
  slug,
  signedIn,
  defaultName,
  defaultEmail,
}: {
  garageId: string;
  garageName: string;
  slug: string;
  signedIn: boolean;
  defaultName: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // ---- auth gate ----
  const [authMode, setAuthMode] = React.useState<"signin" | "signup">("signup");
  const [auth, setAuth] = React.useState({ full_name: "", email: "", password: "" });
  const [authErr, setAuthErr] = React.useState<string | null>(null);
  const [authNotice, setAuthNotice] = React.useState<string | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);

  async function doAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthErr(null);
    setAuthNotice(null);
    const supabase = createClient();
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: auth.email,
        password: auth.password,
        options: { data: { full_name: auth.full_name } },
      });
      if (error) {
        setAuthErr(error.message);
        setAuthBusy(false);
        return;
      }
      if (!data.session) {
        setAuthNotice("Check your email to confirm your address, then come back and sign in.");
        setAuthBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: auth.email, password: auth.password });
      if (error) {
        setAuthErr(error.message);
        setAuthBusy(false);
        return;
      }
    }
    router.refresh();
  }

  // ---- request form ----
  const [form, setForm] = React.useState({
    contact_name: defaultName,
    contact_phone: "",
    make: "",
    model: "",
    year: "",
    license_plate: "",
    title: "",
    customer_note: "",
    date: "",
    time: "09:00",
  });
  const [pics, setPics] = React.useState<Pic[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [doneId, setDoneId] = React.useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function addPics(files: File[]) {
    const next = files.slice(0, 8 - pics.length).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPics((p) => [...p, ...next]);
  }
  function removePic(i: number) {
    setPics((p) => {
      URL.revokeObjectURL(p[i].preview);
      return p.filter((_, idx) => idx !== i);
    });
  }

  const ready = form.contact_name.trim() && form.date && (form.make.trim() || form.license_plate.trim());

  async function submit() {
    if (!ready) {
      toast.push("Add your name, the vehicle, and a preferred date.", "error");
      return;
    }
    setBusy(true);
    try {
      // upload photos first
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const paths: string[] = [];
      for (const p of pics) {
        const ext = p.file.name.split(".").pop() || "jpg";
        const path = `${garageId}/appointments/${user?.id ?? "anon"}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("garage-media").upload(path, p.file, { upsert: false });
        if (error) {
          toast.push(`Photo upload failed: ${error.message}`, "error");
          continue;
        }
        paths.push(path);
      }

      const preferred = new Date(`${form.date}T${form.time || "09:00"}`);
      const id = await requestAppointment({
        booking_slug: slug,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim() || undefined,
        make: form.make.trim() || undefined,
        model: form.model.trim() || undefined,
        year: form.year.trim() || undefined,
        license_plate: form.license_plate.trim() || undefined,
        title: form.title.trim() || undefined,
        customer_note: form.customer_note.trim() || undefined,
        preferred_at: preferred.toISOString(),
        photo_paths: paths,
      });
      setDoneId(id);
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setBusy(false);
  }

  if (doneId) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <p className="text-base font-semibold text-text">Request sent to {garageName} ✅</p>
          <p className="text-sm text-text-muted">
            They&apos;ll review your preferred time and either confirm it or suggest another. You can track it
            any time.
          </p>
          <Link href="/portal/appointments" className="inline-block pt-1 text-sm font-medium text-brand hover:underline">
            View my appointments →
          </Link>
        </CardBody>
      </Card>
    );
  }

  if (!signedIn) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-text">
            {authMode === "signup" ? "First, create an account" : "Sign in to continue"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            This lets you track the request and see {garageName}&apos;s reply.
          </p>
          <form onSubmit={doAuth} className="mt-4 space-y-3">
            {authMode === "signup" ? (
              <Field label="Your name">
                <Input value={auth.full_name} onChange={(e) => setAuth({ ...auth, full_name: e.target.value })} required />
              </Field>
            ) : null}
            <Field label="Email">
              <Input
                type="email"
                value={auth.email}
                onChange={(e) => setAuth({ ...auth, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                minLength={8}
                value={auth.password}
                onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                required
              />
            </Field>
            {authErr ? <p className="text-sm text-[var(--tone-red-fg)]">{authErr}</p> : null}
            {authNotice ? <p className="text-sm text-[var(--tone-green-fg)]">{authNotice}</p> : null}
            <Button type="submit" className="w-full" disabled={authBusy}>
              {authBusy ? "…" : authMode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <button
            onClick={() => {
              setAuthMode(authMode === "signup" ? "signin" : "signup");
              setAuthErr(null);
              setAuthNotice(null);
            }}
            className="mt-3 text-sm text-brand hover:underline"
          >
            {authMode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
          {defaultEmail ? null : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold text-text">Your details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="876-…" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold text-text">Vehicle</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Make">
              <Input value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" />
            </Field>
            <Field label="Model">
              <Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Corolla" />
            </Field>
            <Field label="Year">
              <Input value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2016" inputMode="numeric" />
            </Field>
            <Field label="Licence plate">
              <Input value={form.license_plate} onChange={(e) => set("license_plate", e.target.value)} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold text-text">What&apos;s wrong?</p>
          <Field label="Short summary">
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. brakes squealing, service due" />
          </Field>
          <Field label="Any detail that helps" hint="Noises, when it happens, warning lights…">
            <Textarea rows={3} value={form.customer_note} onChange={(e) => set("customer_note", e.target.value)} />
          </Field>

          <div>
            <p className="text-sm font-medium text-text">Photos of the vehicle</p>
            <p className="mb-2 text-xs text-text-muted">Optional — helps the garage prepare. Up to 8.</p>
            <label className="inline-block cursor-pointer rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
              Add photos
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files && addPics(Array.from(e.target.files))}
              />
            </label>
            {pics.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {pics.map((p, i) => (
                  <div key={p.preview} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" className="aspect-square w-full rounded-[var(--radius)] border border-border object-cover" />
                    <button
                      type="button"
                      onClick={() => removePic(i)}
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold text-text">Preferred time</p>
          <p className="text-xs text-text-muted">A request, not a booking — {garageName} will confirm or suggest another.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} min={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="Time">
              <Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Button className="w-full" disabled={busy || !ready} onClick={submit}>
        {busy ? "Sending…" : "Send request"}
      </Button>
    </div>
  );
}
