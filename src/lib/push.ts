import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@example.com";

const configured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Sends a push notification to every device the given user has subscribed.
 * Best-effort: never throws. Prunes subscriptions the push service reports
 * as gone (404/410 — the browser dropped them, e.g. uninstall or expiry).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configured) return 0;
  const supabase = createAdminClient();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return 0;

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const sub = {
        endpoint: s.endpoint as string,
        keys: { p256dh: s.p256dh as string, auth: s.auth_key as string },
      };
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id as string);
        }
        // other errors (network blips, payload too large) — best-effort, ignore
      }
    }),
  );
  return sent;
}

/**
 * Drains unpushed rows from the staff `notifications` table (garage_id +
 * either a direct user_id or a role broadcast) and sends push to every
 * resolved recipient. Mirrors drainMessageQueue's shape for customer_messages.
 */
export async function drainStaffPush(limit = 25): Promise<{ processed: number; sent: number }> {
  if (!configured) return { processed: 0, sent: 0 };
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, garage_id, user_id, roles, title, body, entity_type, entity_id")
    .is("pushed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const queue = rows ?? [];
  if (queue.length === 0) return { processed: 0, sent: 0 };

  let sent = 0;

  for (const row of queue) {
    let userIds: string[] = [];

    if (row.user_id) {
      userIds = [row.user_id as string];
    } else if (row.roles) {
      const { data: members } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("garage_id", row.garage_id as string)
        .eq("status", "active")
        .in("role", row.roles as string[]);
      userIds = (members ?? []).map((m) => m.user_id as string);
    }

    const url =
      row.entity_type === "work_order" && row.entity_id
        ? `/workshop/jobs/${row.entity_id}`
        : "/notifications";

    const results = await Promise.all(
      userIds.map((uid) =>
        sendPushToUser(uid, {
          title: row.title as string,
          body: (row.body as string) ?? "",
          url,
          tag: `notif-${row.id}`,
        }),
      ),
    );
    sent += results.filter((n) => n > 0).length;

    await supabase
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", row.id as string);
  }

  return { processed: queue.length, sent };
}
