"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, ACTIVE_GARAGE_COOKIE } from "@/lib/auth";
import { slugify } from "@/lib/format";
import type { ActionState } from "@/lib/actions/types";

export async function setActiveGarage(garageId: string): Promise<void> {
  const ctx = await getSessionContext();
  if (!ctx?.memberships.some((m) => m.garage_id === garageId)) {
    throw new Error("Not a member of that garage");
  }
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_GARAGE_COOKIE, garageId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function createGarageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const currency = String(formData.get("currency") ?? "JMD").trim() || "JMD";

  if (name.length < 2) return { error: "Enter your garage name." };

  const supabase = await createClient();
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await supabase.rpc("create_garage", {
    p_name: name,
    p_slug: slug,
    p_phone: phone || null,
    p_email: email || null,
    p_address: address || null,
    p_currency: currency,
  });

  if (error) return { error: error.message };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_GARAGE_COOKIE, data as string, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  redirect("/dashboard");
}
