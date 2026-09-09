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
import { TourButton } from "@/components/tour/AppTour";

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
        actions={
          <div className="flex items-center gap-2">
            <TourButton tour="payment" label="How to take payment" />
            <Badge tone={TONE[status] ?? "gray"}>{status}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card data-tour="invoice-items">
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <TableWrap cards className="rounded-none border-0">
              <Table className="gf-table-cards">
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
                  {(items ?? []).map((it) => {
                    const fromJob = ["work_order_parts", "work_order_labor", "work_order_services"].includes(
                      it.source_type as string,
                    );
                    return (
                      <tr key={it.id as string}>
                        <Td label="Description">
                          {it.description as string}
                          {fromJob ? <span className="ml-1 text-xs text-text-subtle">· from job</span> : null}
                        </Td>
                        <Td label="Kind" className="text-text-muted capitalize">{it.kind as string}</Td>
                        <Td label="Qty" className="text-right text-text-muted">{Number(it.quantity)}</Td>
                        <Td label="Unit" className="text-right text-text-muted">{money(Number(it.unit_price), cur)}</Td>
                        <Td label="Amount" className="text-right font-medium">{money(Number(it.amount), cur)}</Td>
                        <Td label="" className="text-right max-sm:justify-end">
                          {!fromJob && !["cancelled"].includes(status) ? (
                            <RemoveItem invoiceId={id} itemId={it.id as string} />
                          ) : null}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            {!["cancelled", "paid"].includes(status) ? (
              <CardBody className="space-y-2 border-t border-border">
                <p className="text-xs text-text-muted">
                  Parts, labour and services sync automatically from the work order. Add one-off charges or
                  discounts here.
                </p>
                <AddItem invoiceId={id} />
              </CardBody>
            ) : null}
          </Card>

          <Card data-tour="invoice-payment">
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            {(payments ?? []).length === 0 ? (
              <CardBody className="text-sm text-text-muted">No payments recorded.</CardBody>
            ) : (
              <TableWrap cards className="rounded-none border-0">
                <Table className="gf-table-cards">
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
                        <Td label="When" className="text-text-muted">{dateTime(p.created_at as string)}</Td>
                        <Td label="Method" className="capitalize">{(p.method as string).replace("_", " ")}</Td>
                        <Td label="Reference" className="text-text-muted">{(p.reference as string) ?? "—"}</Td>
                        <Td label="Amount" className={`text-right font-medium ${p.is_refund ? "text-[var(--tone-red-fg)]" : ""}`}>
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
          <Card data-tour="invoice-summary">
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

          <div data-tour="invoice-actions">
            <StatusControls invoiceId={id} status={status} workOrderId={w?.id ?? null} />
          </div>
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
