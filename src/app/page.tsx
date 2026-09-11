import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal";
import { homeForRole } from "@/lib/permissions";
import { HomePage } from "@/components/marketing/HomePage";

export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx) return <HomePage />;

  if (ctx.memberships.length > 0) {
    redirect(homeForRole(ctx.memberships[0].role));
  }
  if (ctx.isPlatformAdmin) redirect("/admin");

  // no garage membership — maybe a customer portal user
  const portal = await getPortalContext();
  if (portal && portal.customers.length > 0) redirect("/portal");

  redirect("/onboarding");
}
