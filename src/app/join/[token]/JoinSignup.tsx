"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/primitives";

export function JoinSignup({
  token,
  email,
  garageName,
  roleLabel,
}: {
  token: string;
  email: string;
  garageName: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/join/${token}`,
      },
    });
    if (error) {
      // most likely: account already exists
      setError(
        /already registered|already exists/i.test(error.message)
          ? "You already have an account with this email — use “Sign in” below."
          : error.message,
      );
      setPending(false);
      return;
    }
    if (!data.session) {
      setNotice("Check your email to confirm your address, then open this invite link again.");
      setPending(false);
      return;
    }
    // signed in — the /join page will now accept the invitation
    router.refresh();
  }

  return (
    <>
      <p className="mt-2 text-sm text-text-muted">
        <strong>{garageName}</strong> has invited you to join as <strong>{roleLabel}</strong>. Create your
        account to accept — you&apos;ll get your own dashboard for this garage.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Field label="Your name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Email" hint="Fixed to the address the invite was sent to.">
          <Input type="email" value={email} readOnly className="bg-surface-2 text-text-muted" />
        </Field>
        <Field label="Choose a password">
          <Input
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error ? <p className="text-sm text-[var(--tone-red-fg)]">{error}</p> : null}
        {notice ? <p className="text-sm text-[var(--tone-green-fg)]">{notice}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating your account…" : "Create account & join"}
        </Button>
      </form>
      <p className="mt-3 text-sm text-text-muted">
        Already have a GarageFlow account?{" "}
        <Link href={`/login?next=/join/${token}`} className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
