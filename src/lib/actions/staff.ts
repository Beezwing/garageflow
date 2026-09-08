"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { assertWithinPlan } from "@/lib/plan-guard";
import { writeAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications";
import type { MembershipRole } from "@/types/domain";

type Result = { error?: string; ok?: boolean; inviteUrl?: string; emailed?: boolean };

const ROLES: MembershipRole[] = ["garage_admin", "supervisor", "technician", "receptionist"];

export async function inviteStaff(_prev: Result, formData: FormData): Promise<Result> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "staff.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as MembershipRole;
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };

  try {
    await assertWithinPlan(ctx.garage.id, "users");
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = await createClient();

  // don't stack duplicate pending invites for the same person
  await supabase
    .from("invitations")
    .delete()
    .eq("garage_id", ctx.garage.id)
    .eq("email", email)
    .is("accepted_at", null);

  const { data, error } = await supabase
    .from("invitations")
    .insert({ garage_id: ctx.garage.id, email, role, invited_by: ctx.userId })
    .select("token")
    .single();

  if (error) return { error: error.message };

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "staff.invited",
    entityType: "invitation",
    entityId: email,
    after: { email, role },
  });

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const inviteUrl = `${base}/join/${data.token}`;

  // email the invite if a provider is configured; otherwise the UI shows the link
  let emailed = false;
  try {
    const roleLabel = role.replace("_", " ");
    const res = await sendEmail({
      to: email,
      subject: `You've been invited to join ${ctx.garage.name} on GarageFlow`,
      body:
        `${ctx.garage.name} has invited you to join their workshop on GarageFlow as ${roleLabel}.\n\n` +
        `Open this link and sign in (or create an account) with this email address — ${email} — to accept:\n\n` +
        `${inviteUrl}\n\n` +
        `The invitation expires in 14 days.`,
    });
    emailed = res.ok;
  } catch {
    emailed = false;
  }

  revalidatePath("/settings/staff");
  return { ok: true, inviteUrl, emailed };
}

export async function changeStaffRole(formData: FormData): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "staff.manage");

  const membershipId = String(formData.get("membership_id"));
  const role = String(formData.get("role")) as MembershipRole;
  if (!ROLES.includes(role)) throw new Error("Invalid role");

  const supabase = await createClient();
  // guard: never leave the garage with zero admins
  if (role !== "garage_admin") {
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("garage_id", ctx.garage.id)
      .eq("role", "garage_admin")
      .eq("status", "active");
    const { data: target } = await supabase
      .from("memberships")
      .select("role")
      .eq("id", membershipId)
      .single();
    if (target?.role === "garage_admin" && (count ?? 0) <= 1) {
      throw new Error("You cannot remove the last garage admin.");
    }
  }

  const { error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("id", membershipId)
    .eq("garage_id", ctx.garage.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "staff.role_changed",
    entityType: "membership",
    entityId: membershipId,
    after: { role },
  });
  revalidatePath("/settings/staff");
}

export async function removeStaff(formData: FormData): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "staff.manage");

  const membershipId = String(formData.get("membership_id"));
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("memberships")
    .select("role, user_id")
    .eq("id", membershipId)
    .single();

  if (target?.user_id === ctx.userId) throw new Error("You cannot remove yourself.");
  if (target?.role === "garage_admin") {
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("garage_id", ctx.garage.id)
      .eq("role", "garage_admin")
      .eq("status", "active");
    if ((count ?? 0) <= 1) throw new Error("You cannot remove the last garage admin.");
  }

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("garage_id", ctx.garage.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "staff.removed",
    entityType: "membership",
    entityId: membershipId,
  });
  revalidatePath("/settings/staff");
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "staff.manage");
  const id = String(formData.get("invitation_id"));
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/settings/staff");
}
