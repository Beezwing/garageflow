import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money } from "@/lib/format";
import {
  PageHeader,
  EmptyState,
  Badge,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/StatCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { NewPartButton, PartRowActions, type Part } from "./PartsClient";

export const metadata = { title: "Parts" };

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "inventory.view")) redirect("/dashboard");
  const { q, filter } = await searchParams;
  const supabase = await createClient();
  const cur = ctx.garage.currency;
  const manage = can(ctx.role, "inventory.manage");

  let query = supabase
    .from("parts")
    .select("*, supplier:suppliers(name)")
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .order("name")
    .limit(300);
  if (q) query = query.or(`name.ilike.%${q}%,part_number.ilike.%${q}%,category.ilike.%${q}%`);

  const { data: parts } = await query;
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .order("name");

  const all = (parts ?? []) as unknown as (Part & { supplier: { name: string } | null })[];
  const low = all.filter((p) => Number(p.quantity) <= Number(p.min_stock));
  const shown = filter === "low" ? low : all;
  const stockValue = all.reduce((t, p) => t + Number(p.quantity) * Number(p.cost), 0);

  return (
    <div data-tour="parts-page">
      <PageHeader
        title="Parts & inventory"
        description="Stock on hand, costs and low-stock alerts."
        actions={
          manage ? (
            <NewPartButton suppliers={(suppliers ?? []) as { id: string; name: string }[]} currency={cur} />
          ) : null
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Parts tracked" value={all.length} />
        <StatCard
          label="Low stock"
          value={low.length}
          href={low.length ? "/inventory/parts?filter=low" : undefined}
          tone={low.length ? "amber" : "gray"}
        />
        <StatCard label="Stock value (at cost)" value={money(stockValue, cur)} />
      </div>
      <div className="mb-4 flex items-center gap-3">
        <SearchBar placeholder="Search name, part no., category…" />
        {filter === "low" ? (
          <Link href="/inventory/parts" className="text-sm text-brand hover:underline">
            Show all
          </Link>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={filter === "low" ? "Nothing low on stock" : q ? "No matching parts" : "No parts yet"}
          description={q || filter ? "" : "Add the parts you keep on the shelf."}
        />
      ) : (
        <TableWrap cards>
          <Table className="gf-table-cards">
            <thead>
              <tr>
                <Th>Part</Th>
                <Th>Category</Th>
                <Th>Supplier</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Price</Th>
                <Th>Location</Th>
                {manage ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const isLow = Number(p.quantity) <= Number(p.min_stock);
                return (
                  <tr key={p.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/inventory/parts/${p.id}`} className="font-medium text-brand hover:underline">
                        {p.name}
                      </Link>
                      {p.part_number ? (
                        <span className="ml-1 font-mono text-xs text-text-subtle">{p.part_number}</span>
                      ) : null}
                    </Td>
                    <Td label="Category" className="text-text-muted">{p.category ?? "—"}</Td>
                    <Td label="Supplier" className="text-text-muted">{p.supplier?.name ?? "—"}</Td>
                    <Td label="On hand" className="text-right">
                      <span className={isLow ? "font-semibold text-[var(--tone-amber-fg)]" : ""}>{Number(p.quantity)}</span>
                      {isLow ? <Badge tone="amber" className="ml-1">low</Badge> : null}
                    </Td>
                    <Td label="Cost" className="text-right text-text-muted">{money(Number(p.cost), cur)}</Td>
                    <Td label="Price" className="text-right">{money(Number(p.price), cur)}</Td>
                    <Td label="Location" className="text-text-muted">{p.location ?? "—"}</Td>
                    {manage ? (
                      <Td label="" className="whitespace-nowrap text-right max-sm:justify-end">
                        <PartRowActions part={p} suppliers={(suppliers ?? []) as { id: string; name: string }[]} currency={cur} />
                      </Td>
                    ) : null}
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
