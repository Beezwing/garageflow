"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";

export async function startWork(workOrderId: string, taskId?: string) {
  await requireGarageContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_time_entry", {
    p_work_order: workOrderId,
    p_task: taskId ?? null,
    p_note: null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/workshop/my-jobs");
  revalidatePath(`/workshop/jobs/${workOrderId}`);
}

export async function stopWork(workOrderId?: string) {
  await requireGarageContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_time_entry", { p_entry: null });
  if (error) throw new Error(error.message);
  revalidatePath("/workshop/my-jobs");
  if (workOrderId) revalidatePath(`/workshop/jobs/${workOrderId}`);
}
