"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";

const KINDS = ["inspection", "repair", "quality", "checkout"];

export async function saveChecklist(kind: string, name: string, items: string[]): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "settings.manage");
  if (!KINDS.includes(kind)) throw new Error("Unknown checklist");
  const cleaned = items.map((s) => s.trim()).filter(Boolean);

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("checklist_templates")
    .select("id")
    .eq("garage_id", ctx.garage.id)
    .eq("kind", kind)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("checklist_templates")
      .update({ name: name || `${kind} checklist`, items: cleaned })
      .eq("id", existing.id);
  } else {
    await supabase.from("checklist_templates").insert({
      garage_id: ctx.garage.id,
      kind,
      name: name || `${kind} checklist`,
      items: cleaned,
      is_default: true,
    });
  }
  revalidatePath("/settings/checklists");
}
