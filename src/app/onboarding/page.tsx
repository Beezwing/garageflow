import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal";
import { BrandMark } from "@/components/ui/BrandMark";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Set up your garage" };

export default async function OnboardingPage() {
  const ctx = await requireUser();
  if (ctx.memberships.length > 0) redirect("/dashboard");
  const portal = await getPortalContext();
  if (portal && portal.customers.length > 0) redirect("/portal");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <BrandMark size={40} />
        <h1 className="mt-4 text-2xl font-semibold text-text">Set up your garage</h1>
        <p className="mt-1 text-sm text-text-muted">
          This creates your workspace. You can invite staff and fine-tune settings next.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
