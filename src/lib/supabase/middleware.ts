import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "./config";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/verify",
  "/reset-password",
  "/auth",
  "/portal/login",
  "/book",
  "/join",
  "/api/cron",
];

export async function updateSession(request: NextRequest) {
  const { pathname: earlyPath } = request.nextUrl;

  // Not configured yet → funnel everything to the setup page.
  if (!hasSupabaseEnv()) {
    if (earlyPath === "/setup" || earlyPath.startsWith("/_next")) {
      return NextResponse.next({ request });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && !isPublic && pathname !== "/") {
    const url = request.nextUrl.clone();
    // portal visitors land on the portal login, staff on the app login
    url.pathname = pathname.startsWith("/portal") ? "/portal/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
