import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireGarageContext();
  const supabase = await createClient();

  const tourValue = (ctx.profile as Record<string, unknown> | null)?.tour_completed_at;

  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("garage_id", ctx.garage.id)
    .is("read_at", null);

  return (
    <AppShell
      role={ctx.role}
      userName={ctx.profile?.full_name || ctx.email}
      email={ctx.email}
      garage={{ id: ctx.garage.id, name: ctx.garage.name }}
      garages={ctx.memberships.map((m) => ({ id: m.garage.id, name: m.garage.name }))}
      isPlatformAdmin={ctx.isPlatformAdmin}
      tourPending={tourValue === null}
      unreadCount={unread ?? 0}
    >
      {children}
    </AppShell>
  );
}
