import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSafetyTips } from "@/lib/safety";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { SafetyEditor } from "./SafetyEditor";

export const metadata = { title: "Safety" };

const ICON: Record<string, string> = { critical: "🚨", warning: "⚠️", info: "🦺" };

export default async function SafetySettingsPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "service.manage")) redirect("/settings");

  const all = await getSafetyTips(ctx.garage.id, { activeOnly: false });
  const global = all.filter((t) => t.garage_id === null);
  const mine = all.filter((t) => t.garage_id !== null);

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-text-muted">
        Technicians see these as a popup when they open a job they&apos;re assigned to, and any time on the{" "}
        <a href="/safety" className="text-brand hover:underline">
          Safety
        </a>{" "}
        page.
      </p>

      <SafetyEditor tips={mine} />

      <Card>
        <CardHeader>
          <CardTitle>Standard library ({global.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          <p className="text-text-muted">
            Provided for every garage — shown alongside your own. You can&apos;t edit these; add your own
            above to cover shop-specific hazards.
          </p>
          {global.map((t) => (
            <div key={t.id} className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2">
              <p className="text-sm font-medium text-text">
                {ICON[t.severity] ?? "🦺"} {t.title}
                {t.category ? <span className="ml-1 text-xs text-text-subtle">· {t.category}</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{t.body}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
