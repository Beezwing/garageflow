"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";

export default function ResetPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // If the user arrived from a recovery link, Supabase sets a session and we let
  // them set a new password here.
  const [recovery, setRecovery] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");

  React.useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPending(false);
    if (error) setError(error.message);
    else window.location.href = "/";
  }

  return (
    <Card>
      <CardBody>
        {recovery ? (
          <>
            <h1 className="text-lg font-semibold text-text">Set a new password</h1>
            <form onSubmit={updatePassword} className="mt-5 space-y-4">
              <Field label="New password" hint="At least 8 characters.">
                <Input
                  type="password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
              {error ? <p className="text-sm text-[var(--tone-red-fg)]">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Saving…" : "Update password"}
              </Button>
            </form>
          </>
        ) : sent ? (
          <>
            <h1 className="text-lg font-semibold text-text">Check your email</h1>
            <p className="mt-2 text-sm text-text-muted">
              If an account exists for {email}, a reset link is on its way.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-text">Reset password</h1>
            <p className="mt-1 text-sm text-text-muted">We&apos;ll email you a reset link.</p>
            <form onSubmit={requestLink} className="mt-5 space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {error ? <p className="text-sm text-[var(--tone-red-fg)]">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <Link href="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
              Back to sign in
            </Link>
          </>
        )}
      </CardBody>
    </Card>
  );
}
