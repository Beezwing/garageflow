import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { homeForRole } from "@/lib/permissions";

export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (ctx.memberships.length === 0) {
    redirect(ctx.isPlatformAdmin ? "/admin" : "/onboarding");
  }
  redirect(homeForRole(ctx.memberships[0].role));
}
