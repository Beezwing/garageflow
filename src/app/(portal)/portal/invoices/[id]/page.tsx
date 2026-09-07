import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle, Badge, TableWrap, Table, Th, Td } from "@/components/ui/primitives";

export default async function PortalInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortalContext();
  const supabase = await createClient();
  const customerIds = ctx.customers.map((c) => c.id);

  const { data: inv } = await supabase
    .from("invoices")
    .select("*, work_order:work_orders(id, number)")
    .eq("id", id)
    .in("customer_id", customerIds)
    .maybeSingle();
  if (!inv) notFound();

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("created_at"),
  ]);

  const garage = ctx.customers.find((c) => c.garage_id === inv.garage_id)?.garage;
  const cur = garage?.currency ?? "JMD";
  const w = inv.work_order as unknown as { id: string; number: string } | null;

  return (
    <div className="space-y-4">
      <Link href="/portal/invoices" className="text-sm text-brand hover:underline">
        ← Invoices
      </Link>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-text">{inv.number as string}</h1>
        <Badge tone={Number(inv.balance) > 0 ? "amber" : "green"}>{inv.status as string}</Badge>
      </div>
      {w ? (
        <Link href={`/portal/jobs/${w.id}`} className="text-sm text-brand hover:underline">
          {w.number}
        </Link>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it) => (
                <tr key={it.id as string}>
                  <Td>{it.description as string}</Td>
                  <Td className="text-right text-text-muted">{Number(it.quantity)}</Td>
                  <Td className="text-right">{money(Number(it.amount), cur)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <CardBody className="space-y-1 border-t border-border text-sm">
          <Row k="Subtotal" v={money(Number(inv.subtotal), cur)} />
          {Number(inv.discount) > 0 ? <Row k="Discount" v={`- ${money(Number(inv.discount), cur)}`} /> : null}
          <Row k={`${garage ? "Tax" : "Tax"} (${(Number(inv.tax_rate) * 100).toFixed(0)}%)`} v={money(Number(inv.tax), cur)} />
          <div className="flex justify-between border-t border-border pt-1 font-semibold text-text">
            <span>Total</span>
            <span>{money(Number(inv.total), cur)}</span>
          </div>
          <Row k="Paid" v={money(Number(inv.paid_amount), cur)} />
          <div className="flex justify-between font-semibold">
            <span>Balance</span>
            <span className={Number(inv.balance) > 0 ? "text-[var(--tone-amber-fg)]" : "text-[var(--tone-green-fg)]"}>
              {money(Number(inv.balance), cur)}
            </span>
          </div>
        </CardBody>
      </Card>

      {(payments ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Payments received</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1 text-sm">
            {(payments ?? []).map((p) => (
              <div key={p.id as string} className="flex justify-between">
                <span className="text-text-muted">
                  {dateTime(p.created_at as string)} · {(p.method as string).replace("_", " ")}
                </span>
                <span>{money(Number(p.amount), cur)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {Number(inv.balance) > 0 ? (
        <p className="text-center text-sm text-text-muted">
          Please settle the balance with {garage?.name ?? "the garage"}
          {garage?.phone ? ` (${garage.phone})` : ""} when you collect your vehicle.
        </p>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{k}</span>
      <span className="text-text">{v}</span>
    </div>
  );
}
