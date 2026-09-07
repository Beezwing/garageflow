import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/primitives";
import { CheckInWizard } from "@/components/checkin/CheckInWizard";

export const metadata = { title: "Vehicle check-in" };

const DEFAULT_CHECKLIST = [
  "Front bumper",
  "Rear bumper",
  "Hood",
  "Windshield",
  "Headlights",
  "Tail lights",
  "Tyres & wheels",
  "Body panels",
  "Seats & interior",
  "Dashboard warning lights",
  "Radio / infotainment",
  "A/C",
  "Engine oil level",
  "Coolant level",
  "Battery",
  "Visible leaks",
  "Personal belongings removed",
];

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; vehicle?: string }>;
}) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "vehicle.checkin")) redirect("/dashboard");

  const { customer, vehicle } = await searchParams;
  const supabase = await createClient();

  const [{ data: customers }, { data: vehicles }, { data: template }, { data: services }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("garage_id", ctx.garage.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("vehicles")
      .select("id, customer_id, make, model, year, license_plate")
      .eq("garage_id", ctx.garage.id)
      .is("deleted_at", null),
    supabase
      .from("checklist_templates")
      .select("items")
      .eq("garage_id", ctx.garage.id)
      .eq("kind", "inspection")
      .eq("is_default", true)
      .maybeSingle(),
    supabase
      .from("services")
      .select("id, name, default_price")
      .eq("garage_id", ctx.garage.id)
      .eq("active", true)
      .order("name"),
  ]);

  const checklistItems = ((template?.items as string[]) ?? []).length
    ? (template!.items as string[])
    : DEFAULT_CHECKLIST;

  return (
    <div data-tour="checkin-page">
      <PageHeader
        title="Vehicle check-in"
        description="Customer → vehicle → condition → work order. Takes about two minutes."
      />
      <CheckInWizard
        garageId={ctx.garage.id}
        garageName={ctx.garage.name}
        currency={ctx.garage.currency}
        services={(services ?? []).map((s) => ({
          id: s.id as string,
          name: s.name as string,
          default_price: Number(s.default_price),
        }))}
        customers={(customers ?? []) as { id: string; name: string; phone: string | null }[]}
        vehicles={((vehicles ?? []) as Record<string, unknown>[]).map((v) => ({
          id: v.id as string,
          customer_id: v.customer_id as string,
          label: `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle",
          plate: (v.license_plate as string) ?? null,
        }))}
        checklistItems={checklistItems}
        preselectCustomer={customer}
        preselectVehicle={vehicle}
      />
    </div>
  );
}
