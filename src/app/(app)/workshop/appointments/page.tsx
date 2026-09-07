import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/primitives";
import { AppointmentsClient } from "./AppointmentsClient";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "customer.manage")) redirect("/dashboard");
  const supabase = await createClient();
  const gid = ctx.garage.id;

  const [{ data: appts }, { data: customers }, { data: vehicles }, { data: services }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, title, scheduled_at, status, notes, customer_id, vehicle_id, customer:customers(name), vehicle:vehicles(make, model, license_plate), service:services(name)",
      )
      .eq("garage_id", gid)
      .order("scheduled_at", { ascending: true })
      .limit(200),
    supabase.from("customers").select("id, name").eq("garage_id", gid).is("deleted_at", null).order("name"),
    supabase
      .from("vehicles")
      .select("id, customer_id, make, model, year, license_plate")
      .eq("garage_id", gid)
      .is("deleted_at", null),
    supabase.from("services").select("id, name").eq("garage_id", gid).eq("active", true).order("name"),
  ]);

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Book work in, then turn an appointment into a check-in when the car arrives."
      />
      <AppointmentsClient
        appointments={(appts ?? []) as never[]}
        customers={(customers ?? []) as { id: string; name: string }[]}
        vehicles={((vehicles ?? []) as Record<string, unknown>[]).map((v) => ({
          id: v.id as string,
          customer_id: v.customer_id as string,
          label: `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""} ${v.license_plate ?? ""}`.trim() || "Vehicle",
        }))}
        services={(services ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
