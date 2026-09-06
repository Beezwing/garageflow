"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import type { GarageStatus } from "@/types/domain";

export async function setGarageStatus(formData: FormData): Promise<void> {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) throw new Error("Forbidden");

  const garageId = String(formData.get("garage_id"));
  const status = String(formData.get("status")) as GarageStatus;
  if (!["trial", "active", "suspended", "cancelled"].includes(status)) {
    throw new Error("Invalid status");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("garages").update({ status }).eq("id", garageId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    garageId,
    action: "platform.garage_status_changed",
    entityType: "garage",
    entityId: garageId,
    after: { status },
  });
  revalidatePath("/admin");
}
