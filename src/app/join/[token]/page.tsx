import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setActiveGarage } from "@/lib/actions/garage";
import { Card, CardBody } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = { title: "Join a garage" };

interface Preview {
  email: string;
  role: string;
  garage_name: string;
  expired: boolean;
  accepted: boolean;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardBody>
          <h1 className="text-lg font-semibold text-text">{title}</h1>
          {children}
        </CardBody>
      </Card>
    </div>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getSessionContext();
  const supabase = await createClient();

  const { data: previewRows } = await supabase.rpc("invitation_preview", { p_token: token });
  const preview = (previewRows as Preview[] | null)?.[0] ?? null;
  const roleLabel = preview?.role?.replace("_", " ");

  if (!preview) {
    return (
      <Shell title="Invitation not found">
        <p className="mt-2 text-sm text-text-muted">
          This link is invalid. Ask your garage to send you a fresh invitation.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          Go to GarageFlow
        </Link>
      </Shell>
    );
  }

  if (preview.accepted) {
    return (
      <Shell title="Already accepted">
        <p className="mt-2 text-sm text-text-muted">
          This invitation to <strong>{preview.garage_name}</strong> has already been used.
        </p>
        <ButtonLink href="/login" className="mt-4">
          Sign in
        </ButtonLink>
      </Shell>
    );
  }

  if (preview.expired) {
    return (
      <Shell title="Invitation expired">
        <p className="mt-2 text-sm text-text-muted">
          The invitation to <strong>{preview.garage_name}</strong> for <strong>{preview.email}</strong> has
          expired. Ask them to send a new one.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          Go to GarageFlow
        </Link>
      </Shell>
    );
  }

  if (!ctx) {
    return (
      <Shell title={`Join ${preview.garage_name}`}>
        <p className="mt-2 text-sm text-text-muted">
          You&apos;ve been invited as <strong>{roleLabel}</strong>. Sign in or create an account with{" "}
          <strong>{preview.email}</strong>, then this link will finish setting you up.
        </p>
        <div className="mt-4 flex gap-2">
          <ButtonLink href={`/signup?next=/join/${token}`}>Create account</ButtonLink>
          <ButtonLink href={`/login?next=/join/${token}`} variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });

  if (error) {
    const mismatch = /different email address/i.test(error.message);
    return (
      <Shell title="Invitation problem">
        {mismatch ? (
          <p className="mt-2 text-sm text-text-muted">
            This invitation is for <strong>{preview.email}</strong>, but you&apos;re signed in as{" "}
            <strong>{ctx.email}</strong>. Sign out and sign back in with{" "}
            <strong>{preview.email}</strong> to accept it.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--tone-red-fg)]">{error.message}</p>
        )}
        <div className="mt-4 flex gap-2">
          {mismatch ? (
            <form action="/auth/sign-out" method="post">
              <input type="hidden" name="next" value={`/join/${token}`} />
              <button className="rounded-[var(--radius)] bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg">
                Sign out
              </button>
            </form>
          ) : null}
          <Link href="/" className="self-center text-sm text-brand hover:underline">
            Go to GarageFlow
          </Link>
        </div>
      </Shell>
    );
  }

  await setActiveGarage(data as string);
  redirect("/dashboard");
}
