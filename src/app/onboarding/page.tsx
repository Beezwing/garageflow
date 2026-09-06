import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Set up your garage" };

export default async function OnboardingPage() {
  const ctx = await requireUser();
  if (ctx.memberships.length > 0) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-lg font-bold text-brand-fg">
          G
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-text">Set up your garage</h1>
        <p className="mt-1 text-sm text-text-muted">
          This creates your workspace. You can invite staff and fine-tune settings next.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
