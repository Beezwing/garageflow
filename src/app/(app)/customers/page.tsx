import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { OPEN_STATUSES } from "@/lib/status";
import {
  PageHeader,
  EmptyState,
  TableWrap,
  Table,
  Th,
} from "@/components/ui/primitives";
import { SearchBar } from "@/components/ui/SearchBar";
import { NewCustomerButton, CustomerRow } from "./CustomersClient";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireGarageContext();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .order("name")
    .limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);

  const { data: customers } = await query;
  const ids = (customers ?? []).map((c) => c.id as string);

  const [{ data: vehicles }, { data: jobs }] = await Promise.all([
    ids.length
      ? supabase.from("vehicles").select("customer_id").eq("garage_id", ctx.garage.id).is("deleted_at", null).in("customer_id", ids)
      : Promise.resolve({ data: [] as { customer_id: string }[] }),
    ids.length
      ? supabase.from("work_orders").select("customer_id").eq("garage_id", ctx.garage.id).in("status", OPEN_STATUSES).in("customer_id", ids)
      : Promise.resolve({ data: [] as { customer_id: string }[] }),
  ]);

  const vCount = new Map<string, number>();
  (vehicles ?? []).forEach((v) => vCount.set(v.customer_id as string, (vCount.get(v.customer_id as string) ?? 0) + 1));
  const jCount = new Map<string, number>();
  (jobs ?? []).forEach((j) => jCount.set(j.customer_id as string, (jCount.get(j.customer_id as string) ?? 0) + 1));

  return (
    <div data-tour="customers-page">
      <PageHeader
        title="Customers"
        description="Everyone whose vehicle you've serviced."
        actions={can(ctx.role, "customer.manage") ? <NewCustomerButton /> : null}
      />
      <div className="mb-4">
        <SearchBar placeholder="Search name, phone, email…" />
      </div>
      {(customers ?? []).length === 0 ? (
        <EmptyState
          title={q ? "No matching customers" : "No customers yet"}
          description={q ? "Try a different search." : "Add a customer, or they'll be created during check-in."}
        />
      ) : (
        <TableWrap cards>
          <Table className="gf-table-cards">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Vehicles</Th>
                <Th>Jobs</Th>
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).map((c) => (
                <CustomerRow
                  key={c.id as string}
                  id={c.id as string}
                  name={c.name as string}
                  phone={(c.phone as string) ?? null}
                  email={(c.email as string) ?? null}
                  vehicleCount={vCount.get(c.id as string) ?? 0}
                  openJobs={jCount.get(c.id as string) ?? 0}
                />
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
