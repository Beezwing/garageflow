import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setActiveGarage } from "@/lib/actions/garage";
import { Card, CardBody } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = { title: "Join a garage" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getSessionContext();

  if (!ctx) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardBody>
            <h1 className="text-lg font-semibold text-text">You&apos;ve been invited to GarageFlow</h1>
            <p className="mt-2 text-sm text-text-muted">
              Sign in or create an account with the email address the invitation was sent to, then
              open this link again.
            </p>
            <div className="mt-4 flex gap-2">
              <ButtonLink href={`/signup`}>Create account</ButtonLink>
              <ButtonLink href={`/login?next=/join/${token}`} variant="secondary">
                Sign in
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardBody>
            <h1 className="text-lg font-semibold text-text">Invitation problem</h1>
            <p className="mt-2 text-sm text-[var(--tone-red-fg)]">{error.message}</p>
            <Link href="/" className="mt-4 inline-block text-sm text-brand hover:underline">
              Go to GarageFlow
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  await setActiveGarage(data as string);
  redirect("/dashboard");
}
