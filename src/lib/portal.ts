import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export interface PortalCustomer {
  id: string;
  garage_id: string;
  name: string;
  garage: { id: string; name: string; phone: string | null; currency: string } | null;
}

export interface PortalContext {
  userId: string;
  email: string;
  fullName: string;
  customers: PortalCustomer[];
}

export const getPortalContext = cache(async (): Promise<PortalContext | null> => {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: customers } = await supabase
    .from("customers")
    .select("id, garage_id, name, garage:garages(id, name, phone, currency)")
    .eq("portal_user_id", user.id)
    .is("deleted_at", null);

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: (user.user_metadata?.full_name as string) ?? user.email ?? "",
    customers: ((customers as unknown) as PortalCustomer[]) ?? [],
  };
});

export async function requirePortalContext(): Promise<PortalContext> {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");
  if (ctx.customers.length === 0) redirect("/portal/link");
  return ctx;
}
