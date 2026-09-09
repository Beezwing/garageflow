import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money, shortDate } from "@/lib/format";
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
import { StatCard } from "@/components/ui/StatCard";
import { ButtonLink } from "@/components/ui/Button";
import { CustomerActions } from "./CustomerActions";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) notFound();

  const [{ data: vehicles }, { data: orders }, { data: invoices }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, make, model, year, license_plate, mileage")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("work_orders")
      .select("id, number, status, complaint, checked_in_at, vehicle:vehicles(make, model, license_plate)")
      .eq("customer_id", id)
      .order("checked_in_at", { ascending: false })
      .limit(50),
    supabase
      .from("invoices")
      .select("total, balance, status")
      .eq("customer_id", id)
      .not("status", "in", "(cancelled,draft)"),
  ]);

  const outstanding = (invoices ?? []).reduce((t, i) => t + Number(i.balance), 0);
  const lifetime = (invoices ?? []).reduce((t, i) => t + Number(i.total), 0);
  const manage = can(ctx.role, "customer.manage");

  return (
    <div>
      <PageHeader
        title={customer.name as string}
        description={[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}
        actions={
          <div className="flex gap-2">
            {can(ctx.role, "vehicle.checkin") ? (
              <ButtonLink href={`/workshop/check-in?customer=${id}`}>Check in vehicle</ButtonLink>
            ) : null}
            {manage ? (
              <CustomerActions
                customer={{
                  id: customer.id as string,
                  name: customer.name as string,
                  phone: customer.phone as string | null,
                  email: customer.email as string | null,
                  address: customer.address as string | null,
                  notes: customer.notes as string | null,
                }}
                canDelete={(vehicles ?? []).length === 0}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Vehicles" value={(vehicles ?? []).length} />
        <StatCard label="Lifetime billed" value={money(lifetime, ctx.garage.currency)} tone="green" />
        <StatCard
          label="Outstanding"
          value={money(outstanding, ctx.garage.currency)}
          tone={outstanding > 0 ? "amber" : "gray"}
        />
      </div>

      {customer.address || customer.notes ? (
        <Card className="mt-4">
          <CardBody className="text-sm text-text-muted">
            {customer.address ? <p>{customer.address as string}</p> : null}
            {customer.notes ? <p className="mt-1 italic">{customer.notes as string}</p> : null}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardBody className="text-sm">
          <p className="font-medium text-text">Customer portal</p>
          {customer.portal_user_id ? (
            <p className="mt-1 text-[var(--tone-green-fg)]">Connected — this customer can track repairs online.</p>
          ) : customer.email ? (
            <p className="mt-1 text-text-muted">
              Not connected yet. The customer can sign up at{" "}
              <span className="font-mono">/portal/login</span> using{" "}
              <strong>{customer.email as string}</strong> and they&apos;ll be linked automatically.
            </p>
          ) : (
            <p className="mt-1 text-text-muted">Add an email address to let this customer use the portal.</p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
        </CardHeader>
        {(vehicles ?? []).length === 0 ? (
          <CardBody>
            <EmptyState title="No vehicles on file" />
          </CardBody>
        ) : (
          <TableWrap cards className="rounded-none border-0">
            <Table className="gf-table-cards">
              <thead>
                <tr>
                  <Th>Vehicle</Th>
                  <Th>Plate</Th>
                  <Th>Year</Th>
                  <Th>Mileage</Th>
                </tr>
              </thead>
              <tbody>
                {(vehicles ?? []).map((v) => (
                  <tr key={v.id as string} className="hover:bg-surface-2">
                    <Td label="Vehicle">
                      <Link href={`/vehicles/${v.id}`} className="font-medium text-brand hover:underline">
                        {`${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle"}
                      </Link>
                    </Td>
                    <Td label="Plate" className="text-text-muted">{(v.license_plate as string) ?? "—"}</Td>
                    <Td label="Year" className="text-text-muted">{(v.year as number) ?? "—"}</Td>
                    <Td label="Mileage" className="text-text-muted">
                      {v.mileage ? `${Number(v.mileage).toLocaleString()} km` : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Service history</CardTitle>
        </CardHeader>
        {(orders ?? []).length === 0 ? (
          <CardBody>
            <EmptyState title="No work orders yet" />
          </CardBody>
        ) : (
          <TableWrap cards className="rounded-none border-0">
            <Table className="gf-table-cards">
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Vehicle</Th>
                  <Th>Complaint</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {(orders ?? []).map((o) => {
                  const v = o.vehicle as unknown as { make: string; model: string; license_plate: string } | null;
                  return (
                    <tr key={o.id as string} className="hover:bg-surface-2">
                      <Td label="Job">
                        <Link href={`/workshop/jobs/${o.id}`} className="font-medium text-brand hover:underline">
                          {o.number as string}
                        </Link>
                      </Td>
                      <Td label="Vehicle" className="text-text-muted">
                        {v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : "—"}
                      </Td>
                      <Td label="Complaint" className="text-text-muted max-sm:max-w-none sm:max-w-xs sm:truncate">{(o.complaint as string) ?? "—"}</Td>
                      <Td label="Status">
                        <Badge tone={WORK_ORDER_STATUS_TONE[o.status as keyof typeof WORK_ORDER_STATUS_TONE]}>
                          {WORK_ORDER_STATUS_LABELS[o.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
                        </Badge>
                      </Td>
                      <Td label="Date" className="text-text-muted">{shortDate(o.checked_in_at as string)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
