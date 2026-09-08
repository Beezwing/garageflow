"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function PortalLoginPage() {
  const router = useRouter();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [form, setForm] = React.useState({ full_name: "", email: "", password: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/portal` },
      });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
      if (!data.session) {
        setNotice("Check your email to confirm, then sign in.");
        setPending(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
    }
    router.push("/portal");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm pt-8">
      <Card>
        <CardBody>
          <h1 className="text-lg font-semibold text-text">
            {mode === "signin" ? "Track your repair" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Use the email address your garage has on file for you.
          </p>

          <div className="mt-5">
            <GoogleButton next="/portal" />
          </div>
          <div className="my-4 flex items-center gap-3 text-xs text-text-subtle">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" ? (
              <Field label="Your name">
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </Field>
            ) : null}
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
            {error ? <p className="text-sm text-[var(--tone-red-fg)]">{error}</p> : null}
            {notice ? <p className="text-sm text-[var(--tone-green-fg)]">{notice}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 text-sm text-brand hover:underline"
          >
            {mode === "signin" ? "First time here? Create an account" : "Already have an account? Sign in"}
          </button>
        </CardBody>
      </Card>
    </div>
  );
}
