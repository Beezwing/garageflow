"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { notifyCustomer } from "@/lib/notifications";

export interface CheckInPayload {
  customer_id?: string | null;
  customer?: { name: string; phone?: string; email?: string; address?: string; notes?: string };
  vehicle_id?: string | null;
  vehicle?: {
    make?: string;
    model?: string;
    year?: string;
    license_plate?: string;
    vin?: string;
    engine_number?: string;
    color?: string;
    transmission?: string;
    fuel_type?: string;
    mileage?: string;
  };
  priority?: "normal" | "urgent" | "emergency";
  complaint?: string;
  requested_work?: string;
  notes?: string;
  mileage_in?: string;
  fuel_level_in?: string;
  expected_completion?: string;
  planned?: { service_id?: string; description: string; quantity: number; unit_price: number }[];
  inspection?: {
    checklist: { section: string; item: string; status: string; notes?: string }[];
    notes?: string;
    damages: {
      view: string;
      x: number;
      y: number;
      damage_type: string;
      description?: string;
      notes?: string;
    }[];
  };
  photos?: { url: string; category?: string; caption?: string }[];
  acknowledgement?: { statement: string; customer_signature?: string; staff_signature?: string };
}

export async function submitCheckIn(payload: CheckInPayload): Promise<{ error?: string; id?: string }> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "vehicle.checkin");
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = await createClient();

  // 1. customer / vehicle / work order (atomic RPC)
  const { data: rpc, error: rpcError } = await supabase.rpc("check_in_vehicle", {
    payload: {
      garage_id: ctx.garage.id,
      customer_id: payload.customer_id ?? null,
      customer: payload.customer ?? null,
      vehicle_id: payload.vehicle_id ?? null,
      vehicle: payload.vehicle ?? null,
      priority: payload.priority ?? "normal",
      complaint: payload.complaint ?? null,
      requested_work: payload.requested_work ?? null,
      notes: payload.notes ?? null,
      mileage_in: payload.mileage_in ?? null,
      fuel_level_in: payload.fuel_level_in ?? null,
      expected_completion: payload.expected_completion ?? null,
      planned: payload.planned ?? [],
    },
  });
  if (rpcError) return { error: rpcError.message };

  const result = rpc as { work_order_id: string; number: string };
  const woId = result.work_order_id;

  // 2. inspection + damage markers
  if (payload.inspection && (payload.inspection.checklist.length || payload.inspection.damages.length)) {
    const { data: insp } = await supabase
      .from("inspections")
      .insert({
        garage_id: ctx.garage.id,
        work_order_id: woId,
        kind: "checkin",
        checklist: payload.inspection.checklist,
        notes: payload.inspection.notes ?? null,
        performed_by: ctx.userId,
      })
      .select("id")
      .single();

    if (insp && payload.inspection.damages.length) {
      await supabase.from("inspection_damages").insert(
        payload.inspection.damages.map((d) => ({
          garage_id: ctx.garage.id,
          inspection_id: insp.id,
          view: d.view,
          x: d.x,
          y: d.y,
          damage_type: d.damage_type,
          description: d.description ?? null,
          notes: d.notes ?? null,
        })),
      );
    }
    await supabase.from("work_orders").update({ status: "inspected" }).eq("id", woId);
  }

  // 3. photos (already uploaded to storage by the client)
  if (payload.photos?.length) {
    await supabase.from("vehicle_photos").insert(
      payload.photos.map((p) => ({
        garage_id: ctx.garage.id,
        work_order_id: woId,
        category: p.category ?? null,
        phase: "before",
        url: p.url,
        caption: p.caption ?? null,
        uploaded_by: ctx.userId,
      })),
    );
  }

  // 4. acknowledgement
  if (payload.acknowledgement?.customer_signature || payload.acknowledgement?.staff_signature) {
    await supabase.from("acknowledgements").insert({
      garage_id: ctx.garage.id,
      work_order_id: woId,
      statement: payload.acknowledgement.statement,
      customer_signature: payload.acknowledgement.customer_signature ?? null,
      staff_signature: payload.acknowledgement.staff_signature ?? null,
      staff_user_id: ctx.userId,
    });
  }

  // notify the customer (queued; mock unless a provider is configured)
  try {
    const { data: info } = await supabase
      .from("work_orders")
      .select("customer:customers(id, name, email), vehicle:vehicles(make, model)")
      .eq("id", woId)
      .maybeSingle();
    const cust = (info?.customer as unknown as { id: string; name: string; email: string | null }) ?? null;
    const veh = (info?.vehicle as unknown as { make: string; model: string }) ?? null;
    if (cust) {
      await notifyCustomer({
        garageId: ctx.garage.id,
        customerId: cust.id,
        workOrderId: woId,
        event: "checked_in",
        template: {
          name: cust.name.split(" ")[0],
          vehicle: veh ? `${veh.make ?? ""} ${veh.model ?? ""}`.trim() : "vehicle",
          jobNumber: result.number,
          garage: ctx.garage.name,
        },
        to: cust.email ?? undefined,
      });
    }
  } catch {
    /* never block check-in on a notification */
  }

  revalidatePath("/workshop/jobs");
  revalidatePath("/dashboard");
  return { id: woId };
}

export async function submitCheckInAndRedirect(payload: CheckInPayload): Promise<{ error?: string }> {
  const res = await submitCheckIn(payload);
  if (res.error) return { error: res.error };
  redirect(`/workshop/jobs/${res.id}`);
}
