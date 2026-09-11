import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import { PageHeader, EmptyState, Card } from "@/components/ui/primitives";
import { PushToggle } from "@/components/push/PushToggle";
import { MarkAllRead } from "./MarkAllRead";

export const metadata = { title: "Notifications" };

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
          {rows.map((n) => (
            <Card key={n.id as string} className={n.read_at ? "opacity-70" : ""}>
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
