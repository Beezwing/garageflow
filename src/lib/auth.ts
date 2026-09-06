import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { Garage, Membership, MembershipRole, Profile } from "@/types/domain";

export const ACTIVE_GARAGE_COOKIE = "gf_garage";

export interface SessionContext {
  userId: string;
  email: string;
  profile: Profile | null;
  memberships: (Membership & { garage: Garage })[];
  isPlatformAdmin: boolean;
}

/** Loaded once per request. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("*, garage:garages(*)")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const typedProfile = (profile as unknown as Profile) ?? null;
  return {
    userId: user.id,
    email: user.email ?? "",
    profile: typedProfile,
    memberships: (memberships as unknown as (Membership & { garage: Garage })[]) ?? [],
    isPlatformAdmin: typedProfile?.platform_role === "super_admin",
  };
});

export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export interface GarageContext extends SessionContext {
  garage: Garage;
  role: MembershipRole;
}

/**
 * Resolves the active garage from the `gf_garage` cookie, falling back to the
 * user's first membership. Redirects to onboarding when the user has none.
 */
export async function requireGarageContext(): Promise<GarageContext> {
  const ctx = await requireUser();

  if (ctx.memberships.length === 0) {
    if (ctx.isPlatformAdmin) redirect("/admin");
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_GARAGE_COOKIE)?.value;
  const active =
    ctx.memberships.find((m) => m.garage_id === wanted) ?? ctx.memberships[0];

  return { ...ctx, garage: active.garage, role: active.role };
}

export async function getActiveGarageId(): Promise<string | null> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.memberships.length === 0) return null;
  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_GARAGE_COOKIE)?.value;
  return (
    ctx.memberships.find((m) => m.garage_id === wanted)?.garage_id ??
    ctx.memberships[0].garage_id
  );
}
