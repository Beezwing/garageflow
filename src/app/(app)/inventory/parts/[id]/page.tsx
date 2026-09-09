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
  EmptyState,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/StatCard";
import { PartRowActions, type Part } from "../PartsClient";

const TXN_LABEL: Record<string, string> = {
  receive: "Received",
  add: "Added",
  remove: "Removed",
  adjust: "Adjusted",
  use: "Used on job",
  return: "Returned",
};

export default async function PartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "inventory.view")) redirect("/dashboard");
  const supabase = await createClient();
  const cur = ctx.garage.currency;

  const { data: part } = await supabase
    .from("parts")
    .select("*, supplier:suppliers(id, name)")
    .eq("id", id)
    .eq("garage_id", ctx.garage.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!part) notFound();

  const [{ data: txns }, { data: suppliers }] = await Promise.all([
    supabase
      .from("inventory_transactions")
      .select("*, work_order:work_orders(number, id)")
      .eq("part_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("suppliers").select("id, name").eq("garage_id", ctx.garage.id).is("deleted_at", null).order("name"),
  ]);

  const s = part.supplier as unknown as { id: string; name: string } | null;
  const isLow = Number(part.quantity) <= Number(part.min_stock);
  const used = (txns ?? []).filter((t) => t.type === "use").reduce((n, t) => n + Math.abs(Number(t.quantity_delta)), 0);
  const manage = can(ctx.role, "inventory.manage");

  return (
    <div>
      <PageHeader
        title={part.name as string}
        description={
          <>
            {part.part_number ? <span className="font-mono">{part.part_number as string}</span> : null}
            {s ? ` · ${s.name}` : ""}
            {part.location ? ` · ${part.location}` : ""}
          </>
        }
        actions={
          manage ? (
            <PartRowActions
              part={part as unknown as Part}
              suppliers={(suppliers ?? []) as { id: string; name: string }[]}
              currency={cur}
            />
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="On hand"
          value={Number(part.quantity)}
          sub={isLow ? `below min (${Number(part.min_stock)})` : `min ${Number(part.min_stock)}`}
          tone={isLow ? "amber" : "gray"}
        />
        <StatCard label="Cost" value={money(Number(part.cost), cur)} />
        <StatCard label="Sell price" value={money(Number(part.price), cur)} />
        <StatCard label="Used all-time" value={used} />
      </div>

      {part.fitment ? (
        <Card className="mt-4">
          <CardBody className="text-sm text-text-muted">Fits: {part.fitment as string}</CardBody>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Movement history</CardTitle>
        </CardHeader>
        {(txns ?? []).length === 0 ? (
          <CardBody>
            <EmptyState title="No movements yet" />
          </CardBody>
        ) : (
          <TableWrap cards className="rounded-none border-0">
            <Table className="gf-table-cards">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Change</Th>
                  <Th className="text-right">After</Th>
                  <Th>Reference</Th>
                </tr>
              </thead>
              <tbody>
                {(txns ?? []).map((t) => {
                  const w = t.work_order as unknown as { number: string; id: string } | null;
                  const delta = Number(t.quantity_delta);
                  return (
                    <tr key={t.id as string} className="hover:bg-surface-2">
                      <Td label="When" className="whitespace-nowrap text-text-muted">{dateTime(t.created_at as string)}</Td>
                      <Td label="Type">
                        <Badge tone={delta >= 0 ? "green" : "amber"}>{TXN_LABEL[t.type as string] ?? t.type}</Badge>
                      </Td>
                      <Td label="Change" className={`text-right font-medium ${delta >= 0 ? "text-[var(--tone-green-fg)]" : "text-[var(--tone-amber-fg)]"}`}>
                        {delta >= 0 ? "+" : ""}
                        {delta}
                      </Td>
                      <Td label="After" className="text-right text-text-muted">{Number(t.quantity_after)}</Td>
                      <Td label="Reference" className="text-text-muted">
                        {w ? (
                          <Link href={`/workshop/jobs/${w.id}`} className="text-brand hover:underline">
                            {w.number}
                          </Link>
                        ) : (
                          (t.reference as string) || (t.note as string) || "—"
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
