import Link from "next/link";
import { requirePortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { Card, CardBody, Badge, EmptyState } from "@/components/ui/primitives";
import { AppointmentActions } from "./AppointmentActions";

export const metadata = { title: "Your appointments" };

const STATE_LABEL: Record<string, string> = {
  pending: "Waiting on the garage",
  proposed: "New time suggested",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};
const STATE_TONE: Record<string, "gray" | "blue" | "amber" | "green" | "red"> = {
  pending: "amber",
  proposed: "blue",
  confirmed: "green",
  declined: "red",
  cancelled: "gray",
};

export default async function PortalAppointments() {
  await requirePortalContext();
  const supabase = await createClient();

  const [apptsRes, bookRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, title, scheduled_at, preferred_at, proposed_at, request_state, staff_note, customer_note, garage:garages(name), vehicle:vehicles(make, model, license_plate)",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("my_booking_garages"),
  ]);

  const appts = apptsRes.data;
  const bookGarages = bookRes.data;
  const rows = (appts ?? []).filter((a) => a.request_state);
  const bookLinks = (bookGarages as { id: string; name: string; booking_slug: string }[] | null) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Your appointments</h1>
      </div>

      {bookLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {bookLinks.map((g) => (
            <Link
              key={g.id}
              href={`/book/${g.booking_slug}`}
              className="rounded-[var(--radius)] bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-hover"
            >
              Request an appointment{bookLinks.length > 1 ? ` — ${g.name}` : ""}
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No appointment requests yet"
          description={bookLinks.length === 0 ? "Ask your garage for their booking link to request one." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const v = a.vehicle as unknown as { make: string; model: string; license_plate: string } | null;
            const g = a.garage as unknown as { name: string } | null;
            const state = a.request_state as string;
            return (
              <Card key={a.id as string}>
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-text">{(a.title as string) || "Repair request"}</p>
                      <p className="text-xs text-text-subtle">
                        {g?.name}
                        {v ? ` · ${[v.make, v.model].filter(Boolean).join(" ")}` : ""}
                        {v?.license_plate ? ` · ${v.license_plate}` : ""}
                      </p>
                    </div>
                    <Badge tone={STATE_TONE[state] ?? "gray"}>{STATE_LABEL[state] ?? state}</Badge>
                  </div>

                  <dl className="grid gap-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-text-subtle">You asked for</dt>
                      <dd className="text-text-muted">{dateTime(a.preferred_at as string)}</dd>
                    </div>
                    {a.proposed_at ? (
                      <div>
                        <dt className="text-xs text-text-subtle">Garage suggests</dt>
                        <dd className="font-medium text-text">{dateTime(a.proposed_at as string)}</dd>
                      </div>
                    ) : state === "confirmed" ? (
                      <div>
                        <dt className="text-xs text-text-subtle">Confirmed for</dt>
                        <dd className="font-medium text-text">{dateTime(a.scheduled_at as string)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {a.staff_note ? (
                    <p className="rounded-[var(--radius)] bg-surface-2 px-3 py-2 text-sm text-text-muted">
                      {a.staff_note as string}
                    </p>
                  ) : null}

                  {state === "proposed" ? <AppointmentActions id={a.id as string} /> : null}
                  {state === "confirmed" ? (
                    <p className="text-sm text-[var(--tone-green-fg)]">See you then. Bring the vehicle in at the confirmed time.</p>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardBody className="text-xs text-text-subtle">
          Repairs in progress are on your{" "}
          <Link href="/portal" className="text-brand hover:underline">
            vehicles page
          </Link>
          .
        </CardBody>
      </Card>
    </div>
  );
}
