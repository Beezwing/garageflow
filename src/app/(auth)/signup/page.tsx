"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = React.useState({ full_name: "", email: "", password: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<"confirm" | "session" | null>(null);
  const [pending, setPending] = React.useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    if (data.session) {
      setDone("session");
      router.push("/onboarding");
      router.refresh();
    } else {
      setDone("confirm");
      setPending(false);
    }
  }

  if (done === "confirm") {
    return (
      <Card>
        <CardBody>
          <h1 className="text-lg font-semibold text-text">Check your email</h1>
          <p className="mt-2 text-sm text-text-muted">
            We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your
            account, then continue setting up your garage.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
            Back to sign in
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <h1 className="text-lg font-semibold text-text">Create your garage account</h1>
        <p className="mt-1 text-sm text-text-muted">Start a 30-day trial. No card required.</p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <Field label="Your name">
            <Input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </Field>
          <Field label="Work email">
            <Input
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </Field>
          {error ? (
            <p className="rounded-[var(--radius)] bg-[var(--tone-red-bg)] px-3 py-2 text-sm text-[var(--tone-red-fg)]">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
