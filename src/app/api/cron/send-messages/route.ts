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
  try {
    const [messages, staffPush] = await Promise.all([drainMessageQueue(50), drainStaffPush(50)]);
    return NextResponse.json({ ok: true, messages, staffPush });
  } catch (e) {
    console.error("[cron/send-messages]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
