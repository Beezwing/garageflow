import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money, dateTime } from "@/lib/format";
import { PageHeader, EmptyState, TableWrap, Table, Th, Td } from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/StatCard";

export const metadata = { title: "Payments" };

function startOf(kind: "day" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (kind === "week") d.setDate(d.getDate() - d.getDay());
  if (kind === "month") d.setDate(1);
  return d.toISOString();
}

export default async function PaymentsPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "payment.record")) redirect("/dashboard");
  const supabase = await createClient();
  const cur = ctx.garage.currency;

  const { data: payments } = await supabase
    .from("payments")
    .select("*, invoice:invoices(number, id, customer:customers(name))")
    .eq("garage_id", ctx.garage.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const sum = (from: string) =>
    (payments ?? [])
      .filter((p) => (p.created_at as string) >= from)
      .reduce((t, p) => t + (p.is_refund ? -Number(p.amount) : Number(p.amount)), 0);

  return (
    <div>
      <PageHeader title="Payments" description="Everything received, most recent first." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Today" value={money(sum(startOf("day")), cur)} tone="green" />
        <StatCard label="This week" value={money(sum(startOf("week")), cur)} tone="green" />
        <StatCard label="This month" value={money(sum(startOf("month")), cur)} tone="green" />
      </div>
      {(payments ?? []).length === 0 ? (
        <EmptyState title="No payments yet" description="Record payments from an invoice." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th>Received by</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p) => {
                const inv = p.invoice as unknown as { number: string; id: string; customer: { name: string } | null } | null;
                return (
                  <tr key={p.id as string} className="hover:bg-surface-2">
                    <Td className="text-text-muted">{dateTime(p.created_at as string)}</Td>
                    <Td>
                      {inv ? (
                        <Link href={`/billing/invoices/${inv.id}`} className="text-brand hover:underline">
                          {inv.number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-text-muted">{inv?.customer?.name ?? "—"}</Td>
                    <Td className="capitalize">{(p.method as string).replace("_", " ")}</Td>
                    <Td className="text-text-muted">{(p.reference as string) ?? "—"}</Td>
                    <Td className="text-text-muted">{p.is_refund ? "Refund" : ""}</Td>
                    <Td className={`text-right font-medium ${p.is_refund ? "text-[var(--tone-red-fg)]" : ""}`}>
                      {p.is_refund ? "-" : ""}
                      {money(Number(p.amount), cur)}
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
