import { NextResponse, type NextRequest } from "next/server";
import { drainMessageQueue } from "@/lib/messages/drain";
import { drainStaffPush } from "@/lib/push";

// Vercel Cron hits this on a schedule (see vercel.json). It can also be pinged
// by an external scheduler (Supabase pg_cron / cron-job.org) with ?key=SECRET.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if unconfigured
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const key = new URL(request.url).searchParams.get("key");
  return key === secret;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Independent jobs — one failing (e.g. the push migration hasn't run yet)
  // must never mask or block the other from reporting/succeeding.
  const [messages, staffPush] = await Promise.allSettled([drainMessageQueue(50), drainStaffPush(50)]);

  if (messages.status === "rejected") console.error("[cron/send-messages] messages", messages.reason);
  if (staffPush.status === "rejected") console.error("[cron/send-messages] staffPush", staffPush.reason);

  return NextResponse.json({
    ok: messages.status === "fulfilled" && staffPush.status === "fulfilled",
    messages: messages.status === "fulfilled" ? messages.value : { error: String(messages.reason) },
    staffPush: staffPush.status === "fulfilled" ? staffPush.value : { error: String(staffPush.reason) },
  });
}

export const GET = handle;
export const POST = handle;
