import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/primitives";
import { AppointmentsClient } from "./AppointmentsClient";
import { AppointmentRequests, type ApptRequest } from "./AppointmentRequests";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "customer.manage")) redirect("/dashboard");
  const supabase = await createClient();
  const gid = ctx.garage.id;

  const WITH_REQUESTS =
    "id, title, scheduled_at, preferred_at, proposed_at, status, request_state, origin, notes, customer_note, staff_note, contact_name, contact_phone, photo_urls, customer_id, vehicle_id, customer:customers(name), vehicle:vehicles(make, model, year, license_plate), service:services(name)";
  const BASE =
    "id, title, scheduled_at, status, notes, customer_id, vehicle_id, customer:customers(name), vehicle:vehicles(make, model, year, license_plate), service:services(name)";

  const runApptQuery = (cols: string) =>
    supabase
      .from("appointments")
      .select(cols)
      .eq("garage_id", gid)
      .order("scheduled_at", { ascending: true })
      .limit(300);

  // before migration 0011 the request_* columns don't exist yet — fall back
  const primary = await runApptQuery(WITH_REQUESTS);
  const appts = (primary.error ? (await runApptQuery(BASE)).data : primary.data) as
    | Record<string, unknown>[]
    | null;

  const [{ data: customers }, { data: vehicles }, { data: services }] = await Promise.all([
    supabase.from("customers").select("id, name").eq("garage_id", gid).is("deleted_at", null).order("name"),
    supabase
      .from("vehicles")
      .select("id, customer_id, make, model, year, license_plate")
      .eq("garage_id", gid)
      .is("deleted_at", null),
    supabase.from("services").select("id, name").eq("garage_id", gid).eq("active", true).order("name"),
  ]);

  const all = appts ?? [];
  const rawRequests = all.filter((a) => ["pending", "proposed"].includes(a.request_state as string));
  const scheduled = all.filter((a) => !a.request_state || a.request_state === "confirmed");

  // sign the request photos (paths live in photo_urls)
  const requests: ApptRequest[] = await Promise.all(
    rawRequests.map(async (a) => {
      const paths = ((a.photo_urls as string[]) ?? []).filter(Boolean);
      let photos: string[] = [];
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("garage-media").createSignedUrls(paths, 3600);
        photos = (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[];
      }
      return { ...(a as unknown as ApptRequest), photos };
    }),
  );

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Book work in, then turn an appointment into a check-in when the car arrives."
      />
      {requests.length > 0 ? <AppointmentRequests requests={requests} /> : null}
      <AppointmentsClient
        appointments={scheduled as never[]}
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
