import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import { PageHeader, EmptyState, Card } from "@/components/ui/primitives";
import { PushToggle } from "@/components/push/PushToggle";
import { MarkAllRead } from "./MarkAllRead";
import { OpenNotification } from "./OpenNotification";

export const metadata = { title: "Notifications" };

/** Where tapping a notification should take you, based on what it's about. */
function linkFor(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  if (entityType === "work_order") return `/workshop/jobs/${entityId}`;
  if (entityType === "appointment") return `/workshop/appointments`;
  return null;
}

export default async function NotificationsPage() {
  const ctx = await requireGarageContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("garage_id", ctx.garage.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up"}
        actions={unread ? <MarkAllRead /> : null}
      />
      <div className="mb-4">
        <PushToggle />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here yet" description="Job assignments, approvals and stock alerts will show up here." />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => {
            const href = linkFor(n.entity_type as string | null, n.entity_id as string | null);
            return (
              <Card key={n.id as string} className={n.read_at ? "opacity-70" : href ? "hover:bg-surface-2" : ""}>
                <OpenNotification id={n.id as string} href={href} read={Boolean(n.read_at)}>
                  <div className="flex items-start gap-3 p-3.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: n.read_at ? "var(--border)" : "var(--brand)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">{n.title as string}</p>
                      {n.body ? <p className="mt-0.5 text-sm text-text-muted">{n.body as string}</p> : null}
                      <p className="mt-1 text-xs text-text-subtle">{relativeTime(n.created_at as string)}</p>
                    </div>
                    {href ? <span className="mt-1 text-text-subtle">&rarr;</span> : null}
                  </div>
                </OpenNotification>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
