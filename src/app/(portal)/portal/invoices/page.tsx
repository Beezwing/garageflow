import Link from "next/link";
import { requirePortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { money, shortDate } from "@/lib/format";
import { Card, CardBody, Badge, EmptyState } from "@/components/ui/primitives";

export const metadata = { title: "Invoices" };

export default async function PortalInvoicesPage() {
  const ctx = await requirePortalContext();
  const supabase = await createClient();
  const customerIds = ctx.customers.map((c) => c.id);
  const cur = ctx.customers[0]?.garage?.currency ?? "JMD";

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, number, status, total, balance, issued_at, work_order:work_orders(number)")
    .in("customer_id", customerIds)
    .not("status", "eq", "draft")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text">Invoices</h1>
      {(invoices ?? []).length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        (invoices ?? []).map((i) => {
          const w = i.work_order as unknown as { number: string } | null;
          return (
            <Link key={i.id as string} href={`/portal/invoices/${i.id}`}>
              <Card className="transition-colors hover:border-brand">
                <CardBody className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text">{i.number as string}</p>
                    <p className="text-xs text-text-subtle">
                      {w ? `${w.number} · ` : ""}
                      {i.issued_at ? shortDate(i.issued_at as string) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-text">{money(Number(i.total), cur)}</p>
                    <Badge tone={Number(i.balance) > 0 ? "amber" : "green"}>
                      {Number(i.balance) > 0 ? `${money(Number(i.balance), cur)} due` : "paid"}
                    </Badge>
                  </div>
                </CardBody>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
