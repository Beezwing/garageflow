import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money, shortDate } from "@/lib/format";
import { PageHeader, EmptyState, Badge, TableWrap, Table, Th, Td } from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/StatCard";

export const metadata = { title: "Invoices" };

const TONE: Record<string, "gray" | "amber" | "green" | "red" | "blue"> = {
  draft: "gray",
  unpaid: "amber",
  partial: "amber",
  paid: "green",
  cancelled: "red",
  refunded: "blue",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "invoice.manage")) redirect("/dashboard");
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select("id, number, status, total, balance, issued_at, created_at, customer:customers(name), work_order:work_orders(number)")
    .eq("garage_id", ctx.garage.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);

  const { data: invoices } = await query;

  const { data: openAgg } = await supabase
    .from("invoices")
    .select("balance")
    .eq("garage_id", ctx.garage.id)
    .in("status", ["unpaid", "partial"]);
  const outstanding = (openAgg ?? []).reduce((t, i) => t + Number(i.balance), 0);

  return (
    <div>
      <PageHeader title="Invoices" description="Built from a job's parts, labour and services." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Outstanding" value={money(outstanding, ctx.garage.currency)} tone={outstanding > 0 ? "amber" : "gray"} />
        <StatCard label="Unpaid invoices" value={(openAgg ?? []).length} />
        <StatCard label="Total invoices" value={(invoices ?? []).length} />
      </div>
      {(invoices ?? []).length === 0 ? (
        <EmptyState title="No invoices yet" description="Generate one from a work order's Invoice panel." />
      ) : (
        <TableWrap cards>
          <Table className="gf-table-cards">
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Job</Th>
                <Th>Customer</Th>
                <Th>Issued</Th>
                <Th>Total</Th>
                <Th>Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(invoices ?? []).map((i) => {
                const c = i.customer as unknown as { name: string } | null;
                const w = i.work_order as unknown as { number: string } | null;
                return (
                  <tr key={i.id as string} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/billing/invoices/${i.id}`} className="font-medium text-brand hover:underline">
                        {i.number as string}
                      </Link>
                    </Td>
                    <Td label="Job" className="text-text-muted">{w?.number ?? "—"}</Td>
                    <Td label="Customer" className="text-text-muted">{c?.name ?? "—"}</Td>
                    <Td label="Issued" className="text-text-muted">{i.issued_at ? shortDate(i.issued_at as string) : "—"}</Td>
                    <Td label="Total">{money(Number(i.total), ctx.garage.currency)}</Td>
                    <Td label="Balance" className={Number(i.balance) > 0 ? "text-[var(--tone-amber-fg)]" : "text-text-muted"}>
                      {money(Number(i.balance), ctx.garage.currency)}
                    </Td>
                    <Td label="Status">
                      <Badge tone={TONE[i.status as string] ?? "gray"}>{i.status as string}</Badge>
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
