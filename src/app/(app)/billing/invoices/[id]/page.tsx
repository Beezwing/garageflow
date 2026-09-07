import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { money, dateTime } from "@/lib/format";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  PageHeader,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { RemoveItem, AddItem, RecordPayment, StatusControls } from "./InvoiceActions";

const TONE: Record<string, "gray" | "amber" | "green" | "red" | "blue"> = {
  draft: "gray",
  unpaid: "amber",
  partial: "amber",
  paid: "green",
  cancelled: "red",
  refunded: "blue",
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "invoice.manage")) redirect("/dashboard");
  const supabase = await createClient();
  const cur = ctx.garage.currency;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customer:customers(id, name, phone), work_order:work_orders(id, number)")
    .eq("id", id)
    .eq("garage_id", ctx.garage.id)
    .maybeSingle();
  if (!invoice) notFound();

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("created_at"),
  ]);

  const c = invoice.customer as unknown as { id: string; name: string; phone: string | null } | null;
  const w = invoice.work_order as unknown as { id: string; number: string } | null;
  const status = invoice.status as string;
  const canPay = can(ctx.role, "payment.record") && !["draft", "cancelled"].includes(status);

  return (
    <div>
      <PageHeader
        title={invoice.number as string}
        description={
          <>
            {c ? (
              <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
                {c.name}
              </Link>
            ) : null}
            {w ? (
              <>
                {" · "}
                <Link href={`/workshop/jobs/${w.id}`} className="text-brand hover:underline">
                  {w.number}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={<Badge tone={TONE[status] ?? "gray"}>{status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Description</Th>
                    <Th>Kind</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit</Th>
                    <Th className="text-right">Amount</Th>
                    {status === "draft" ? <Th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {(items ?? []).map((it) => (
                    <tr key={it.id as string}>
                      <Td>{it.description as string}</Td>
                      <Td className="text-text-muted capitalize">{it.kind as string}</Td>
                      <Td className="text-right text-text-muted">{Number(it.quantity)}</Td>
                      <Td className="text-right text-text-muted">{money(Number(it.unit_price), cur)}</Td>
                      <Td className="text-right font-medium">{money(Number(it.amount), cur)}</Td>
                      {status === "draft" ? (
                        <Td className="text-right">
                          <RemoveItem invoiceId={id} itemId={it.id as string} />
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            {status === "draft" ? (
              <CardBody className="border-t border-border">
                <AddItem invoiceId={id} />
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            {(payments ?? []).length === 0 ? (
              <CardBody className="text-sm text-text-muted">No payments recorded.</CardBody>
            ) : (
              <TableWrap className="rounded-none border-0">
                <Table>
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>Method</Th>
                      <Th>Reference</Th>
                      <Th className="text-right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payments ?? []).map((p) => (
                      <tr key={p.id as string}>
                        <Td className="text-text-muted">{dateTime(p.created_at as string)}</Td>
                        <Td className="capitalize">{(p.method as string).replace("_", " ")}</Td>
                        <Td className="text-text-muted">{(p.reference as string) ?? "—"}</Td>
                        <Td className={`text-right font-medium ${p.is_refund ? "text-[var(--tone-red-fg)]" : ""}`}>
                          {p.is_refund ? "-" : ""}
                          {money(Number(p.amount), cur)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
            {canPay ? (
              <CardBody className="border-t border-border">
                <RecordPayment
                  invoiceId={id}
                  balance={Number(invoice.balance)}
                  methods={["cash", "card", "bank_transfer", "online"]}
                />
              </CardBody>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5 text-sm">
              <Line k="Subtotal" v={money(Number(invoice.subtotal), cur)} />
              {Number(invoice.discount) > 0 ? <Line k="Discount" v={`- ${money(Number(invoice.discount), cur)}`} /> : null}
              <Line k={`${ctx.garage.tax_label} (${(Number(invoice.tax_rate) * 100).toFixed(0)}%)`} v={money(Number(invoice.tax), cur)} />
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-text">
                <span>Total</span>
                <span>{money(Number(invoice.total), cur)}</span>
              </div>
              <Line k="Paid" v={money(Number(invoice.paid_amount), cur)} />
              <div className="flex justify-between font-semibold text-text">
                <span>Balance</span>
                <span className={Number(invoice.balance) > 0 ? "text-[var(--tone-amber-fg)]" : "text-[var(--tone-green-fg)]"}>
                  {money(Number(invoice.balance), cur)}
                </span>
              </div>
            </CardBody>
          </Card>

          <StatusControls invoiceId={id} status={status} workOrderId={w?.id ?? null} />
        </div>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{k}</span>
      <span className="text-text">{v}</span>
    </div>
  );
}
