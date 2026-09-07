import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money } from "@/lib/format";
import { PageHeader, EmptyState, TableWrap, Table, Th, Td } from "@/components/ui/primitives";
import { NewSupplierButton, SupplierActions, type Supplier } from "./SuppliersClient";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "inventory.manage")) redirect("/inventory/parts");
  const supabase = await createClient();
  const cur = ctx.garage.currency;

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*")
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .order("name");

  const ids = (suppliers ?? []).map((s) => s.id as string);
  const [{ data: parts }, { data: spend }] = await Promise.all([
    ids.length
      ? supabase.from("parts").select("supplier_id").eq("garage_id", ctx.garage.id).is("deleted_at", null).in("supplier_id", ids)
      : Promise.resolve({ data: [] as { supplier_id: string }[] }),
    ids.length
      ? supabase
          .from("inventory_transactions")
          .select("supplier_id, quantity_delta, unit_cost")
          .eq("garage_id", ctx.garage.id)
          .eq("type", "receive")
          .in("supplier_id", ids)
      : Promise.resolve({ data: [] as { supplier_id: string; quantity_delta: number; unit_cost: number }[] }),
  ]);

  const partCount = new Map<string, number>();
  (parts ?? []).forEach((p) => partCount.set(p.supplier_id as string, (partCount.get(p.supplier_id as string) ?? 0) + 1));
  const spent = new Map<string, number>();
  (spend ?? []).forEach((t) =>
    spent.set(
      t.supplier_id as string,
      (spent.get(t.supplier_id as string) ?? 0) + Math.abs(Number(t.quantity_delta)) * Number(t.unit_cost ?? 0),
    ),
  );

  return (
    <div>
      <PageHeader title="Suppliers" description="Who you buy parts from." actions={<NewSupplierButton />} />
      {(suppliers ?? []).length === 0 ? (
        <EmptyState title="No suppliers yet" description="Add a supplier so you can log stock received." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th className="text-right">Parts</Th>
                <Th className="text-right">Spent</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {((suppliers ?? []) as Supplier[]).map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <Td className="font-medium text-text">{s.name}</Td>
                  <Td className="text-text-muted">{s.contact_person ?? "—"}</Td>
                  <Td className="text-text-muted">{s.phone ?? "—"}</Td>
                  <Td className="text-right">{partCount.get(s.id) ?? 0}</Td>
                  <Td className="text-right text-text-muted">{money(spent.get(s.id) ?? 0, cur)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <SupplierActions supplier={s} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
