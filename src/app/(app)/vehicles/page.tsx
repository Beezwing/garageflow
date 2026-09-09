import Link from "next/link";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState, TableWrap, Table, Th, Td } from "@/components/ui/primitives";
import { SearchBar } from "@/components/ui/SearchBar";
import { NewVehicleButton } from "./VehiclesClient";

export const metadata = { title: "Vehicles" };

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireGarageContext();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("vehicles")
    .select("id, make, model, year, license_plate, vin, engine_number, mileage, customer:customers(id, name)")
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) {
    query = query.or(
      `license_plate.ilike.%${q}%,vin.ilike.%${q}%,engine_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`,
    );
  }
  const { data: vehicles } = await query;

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .order("name");

  return (
    <div data-tour="vehicles-page">
      <PageHeader
        title="Vehicles"
        description="Search by plate, VIN, engine number, make or model."
        actions={
          can(ctx.role, "vehicle.manage") ? (
            <NewVehicleButton customers={(customers ?? []) as { id: string; name: string }[]} />
          ) : null
        }
      />
      <div className="mb-4">
        <SearchBar placeholder="Search plate, VIN, engine no.…" />
      </div>
      {(vehicles ?? []).length === 0 ? (
        <EmptyState
          title={q ? "No matching vehicles" : "No vehicles yet"}
          description={q ? "Try a plate or VIN." : "Add one, or it'll be created during check-in."}
        />
      ) : (
        <TableWrap cards>
          <Table className="gf-table-cards">
            <thead>
              <tr>
                <Th>Vehicle</Th>
                <Th>Plate</Th>
                <Th>VIN</Th>
                <Th>Owner</Th>
                <Th>Mileage</Th>
              </tr>
            </thead>
            <tbody>
              {(vehicles ?? []).map((v) => {
                const c = v.customer as unknown as { id: string; name: string } | null;
                return (
                  <tr key={v.id as string} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/vehicles/${v.id}`} className="font-medium text-brand hover:underline">
                        {`${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle"}
                      </Link>
                    </Td>
                    <Td label="Plate" className="text-text-muted">{(v.license_plate as string) ?? "—"}</Td>
                    <Td label="VIN" className="font-mono text-xs text-text-muted">{(v.vin as string) ?? "—"}</Td>
                    <Td label="Owner">
                      {c ? (
                        <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
                          {c.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label="Mileage" className="text-text-muted">
                      {v.mileage ? `${Number(v.mileage).toLocaleString()} km` : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
