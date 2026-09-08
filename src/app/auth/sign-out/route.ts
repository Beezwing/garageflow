import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // send customers back to the portal login, staff to the app login
  const referer = request.headers.get("referer") ?? "";
  const fromPortal = /\/portal(\/|$)|\/book\//.test(referer);
  const dest = fromPortal ? "/portal/login" : "/login";

  // 303 → the browser follows with GET (a 307 would re-POST to the page and 405)
  return NextResponse.redirect(new URL(dest, request.url), { status: 303 });
}

export const POST = signOut;
export const GET = signOut;
