import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { getSessionContext } from "@/lib/auth";
import { Card, CardBody } from "@/components/ui/primitives";
import { LinkButton } from "./LinkButton";

export const metadata = { title: "Link your account" };

export default async function PortalLinkPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");
  if (ctx.customers.length > 0) redirect("/portal");

  // if they're actually garage staff, send them to the app
  const session = await getSessionContext();
  if (session && session.memberships.length > 0) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md pt-8">
      <Card>
        <CardBody className="space-y-3">
          <h1 className="text-lg font-semibold text-text">Almost there</h1>
          <p className="text-sm text-text-muted">
            We couldn&apos;t find a customer record for <strong>{ctx.email}</strong> yet.
          </p>
          <p className="text-sm text-text-muted">
            If your garage recently added your email, tap below to connect. Otherwise, ask them to add{" "}
            <strong>{ctx.email}</strong> to your customer profile.
          </p>
          <LinkButton />
        </CardBody>
      </Card>
    </div>
  );
}
