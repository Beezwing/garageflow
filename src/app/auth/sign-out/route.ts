import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string | null {
  if (!value) return null;
  // only same-origin absolute paths
  return /^\/[^/\\]/.test(value) ? value : null;
}

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  let next = safeNext(new URL(request.url).searchParams.get("next"));
  if (!next && request.method === "POST") {
    try {
      const form = await request.formData();
      next = safeNext(String(form.get("next") ?? ""));
    } catch {
      /* no body */
    }
  }

  if (next) {
    // keep them heading where they were going, but through the right login
    const login = next.startsWith("/portal") || next.startsWith("/book") ? "/portal/login" : "/login";
    return NextResponse.redirect(new URL(`${login}?next=${encodeURIComponent(next)}`, request.url), { status: 303 });
  }

  const referer = request.headers.get("referer") ?? "";
  const dest = /\/portal(\/|$)|\/book\//.test(referer) ? "/portal/login" : "/login";
  return NextResponse.redirect(new URL(dest, request.url), { status: 303 });
}

export const POST = signOut;
export const GET = signOut;
