import Link from "next/link";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSafetyTips } from "@/lib/safety";
import { PageHeader, Card, CardBody } from "@/components/ui/primitives";

export const metadata = { title: "Safety" };

const TONE: Record<string, string> = {
  critical: "border-l-[var(--tone-red-fg)]",
  warning: "border-l-[var(--tone-amber-fg)]",
  info: "border-l-border",
};
const ICON: Record<string, string> = { critical: "🚨", warning: "⚠️", info: "🦺" };

export default async function SafetyPage() {
  const ctx = await requireGarageContext();
  const tips = await getSafetyTips(ctx.garage.id);

  const byCat = new Map<string, typeof tips>();
  for (const t of tips) {
    const k = t.category || "General";
    byCat.set(k, [...(byCat.get(k) ?? []), t]);
  }

  return (
    <div>
      <PageHeader
        title="Safety"
        description="Read these before every job. Work safe, go home whole."
      />

      {can(ctx.role, "service.manage") ? (
        <p className="mb-4 text-sm text-text-muted">
          Add tips specific to your shop under{" "}
          <Link href="/settings/safety" className="text-brand hover:underline">
            Settings › Safety
          </Link>
          .
        </p>
      ) : null}

      {tips.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-text-muted">No safety tips yet.</CardBody>
        </Card>
      ) : (
        <div className="space-y-5">
          {[...byCat.entries()].map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">{cat}</h2>
              <div className="space-y-2">
                {list.map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-[var(--radius)] border border-l-4 border-border bg-surface p-3 ${TONE[t.severity] ?? TONE.info}`}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                      <span>{ICON[t.severity] ?? "🦺"}</span>
                      {t.title}
                      {t.garage_id ? (
                        <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[0.65rem] font-normal text-text-subtle">
                          this shop
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">{t.body}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
