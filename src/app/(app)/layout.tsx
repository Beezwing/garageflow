import { requireGarageContext } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireGarageContext();

  const tourValue = (ctx.profile as Record<string, unknown> | null)?.tour_completed_at;

  return (
    <AppShell
      role={ctx.role}
      userName={ctx.profile?.full_name || ctx.email}
      email={ctx.email}
      garage={{ id: ctx.garage.id, name: ctx.garage.name }}
      garages={ctx.memberships.map((m) => ({ id: m.garage.id, name: m.garage.name }))}
      isPlatformAdmin={ctx.isPlatformAdmin}
      tourPending={tourValue === null}
    >
      {children}
    </AppShell>
  );
}
