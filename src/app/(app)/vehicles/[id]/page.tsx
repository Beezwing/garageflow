import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { shortDate } from "@/lib/format";
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_STATUS_TONE } from "@/lib/status";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  PageHeader,
  EmptyState,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import { VehicleActions } from "./VehicleActions";

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  const supabase = await createClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("*, customer:customers(id, name, phone)")
    .eq("id", id)
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!vehicle) notFound();

  const [{ data: orders }, { data: photos }, { data: customers }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, number, status, complaint, mileage_in, checked_in_at, completed_at")
      .eq("vehicle_id", id)
      .order("checked_in_at", { ascending: false }),
    supabase
      .from("vehicle_photos")
      .select("id, url, category, phase, caption, created_at")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false })
      .limit(24),
    supabase.from("customers").select("id, name").eq("garage_id", ctx.garage.id).is("deleted_at", null).order("name"),
  ]);

  const c = vehicle.customer as unknown as { id: string; name: string; phone: string | null } | null;
  const title = `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || "Vehicle";

  const specs: [string, string | null][] = [
    ["Plate", vehicle.license_plate as string],
    ["VIN / chassis", vehicle.vin as string],
    ["Engine no.", vehicle.engine_number as string],
    ["Colour", vehicle.color as string],
    ["Transmission", vehicle.transmission as string],
    ["Fuel", vehicle.fuel_type as string],
    ["Mileage", vehicle.mileage ? `${Number(vehicle.mileage).toLocaleString()} km` : null],
  ];

  return (
    <div>
      <PageHeader
        title={title}
        description={
          c ? (
            <>
              Owner:{" "}
              <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
                {c.name}
              </Link>
            </>
          ) : (
            "No owner"
          )
        }
        actions={
          <div className="flex gap-2">
            {can(ctx.role, "vehicle.checkin") ? (
              <ButtonLink href={`/workshop/check-in?vehicle=${id}`}>Check in</ButtonLink>
            ) : null}
            {can(ctx.role, "vehicle.manage") ? (
              <VehicleActions
                vehicle={{
                  id: vehicle.id as string,
                  customer_id: vehicle.customer_id as string,
                  make: vehicle.make as string | null,
                  model: vehicle.model as string | null,
                  year: vehicle.year as number | null,
                  license_plate: vehicle.license_plate as string | null,
                  vin: vehicle.vin as string | null,
                  engine_number: vehicle.engine_number as string | null,
                  color: vehicle.color as string | null,
                  transmission: vehicle.transmission as string | null,
                  fuel_type: vehicle.fuel_type as string | null,
                  mileage: vehicle.mileage as number | null,
                  notes: vehicle.notes as string | null,
                }}
                customers={(customers ?? []) as { id: string; name: string }[]}
              />
            ) : null}
          </div>
        }
      />

      <Card>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-text-subtle">{k}</dt>
                <dd className="text-sm text-text">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {vehicle.notes ? (
            <p className="mt-4 border-t border-border pt-3 text-sm italic text-text-muted">
              {vehicle.notes as string}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Service history ({(orders ?? []).length})</CardTitle>
        </CardHeader>
        {(orders ?? []).length === 0 ? (
          <CardBody>
            <EmptyState title="No service history" description="This will fill in as the vehicle is worked on." />
          </CardBody>
        ) : (
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Work</Th>
                  <Th>Mileage in</Th>
                  <Th>Status</Th>
                  <Th>Checked in</Th>
                </tr>
              </thead>
              <tbody>
                {(orders ?? []).map((o) => (
                  <tr key={o.id as string} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/workshop/jobs/${o.id}`} className="font-medium text-brand hover:underline">
                        {o.number as string}
                      </Link>
                    </Td>
                    <Td className="max-w-xs truncate text-text-muted">{(o.complaint as string) ?? "—"}</Td>
                    <Td className="text-text-muted">
                      {o.mileage_in ? `${Number(o.mileage_in).toLocaleString()} km` : "—"}
                    </Td>
                    <Td>
                      <Badge tone={WORK_ORDER_STATUS_TONE[o.status as keyof typeof WORK_ORDER_STATUS_TONE]}>
                        {WORK_ORDER_STATUS_LABELS[o.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
                      </Badge>
                    </Td>
                    <Td className="text-text-muted">{shortDate(o.checked_in_at as string)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {(photos ?? []).length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(photos ?? []).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={p.id as string} href={p.url as string} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={p.url as string}
                    alt={(p.caption as string) || (p.category as string) || "Vehicle photo"}
                    className="aspect-square w-full rounded-[var(--radius)] border border-border object-cover"
                  />
                  <p className="mt-1 text-xs text-text-subtle">
                    {(p.phase as string) === "after" ? "After · " : "Before · "}
                    {(p.category as string) || shortDate(p.created_at as string)}
                  </p>
                </a>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
