import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildReport } from "@/lib/reports";
import { money, duration } from "@/lib/format";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { StatCard } from "@/components/ui/StatCard";
import { ReportControls } from "./ReportControls";
import { RevenueChart } from "./RevenueChart";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "reports.view")) redirect("/dashboard");
  const { range = "30d" } = await searchParams;
  const r = await buildReport(ctx.garage.id, ctx.garage.currency, range);
  const cur = r.currency;

  return (
    <div>
      <PageHeader title="Reports" description="Filtered to the selected period unless noted otherwise." />
      <div className="mb-5">
        <ReportControls />
      </div>

      {/* Financial */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Financial</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Revenue collected" value={money(r.revenue, cur)} tone="green" />
          <StatCard label="Outstanding (all time)" value={money(r.outstanding, cur)} tone={r.outstanding > 0 ? "amber" : "gray"} />
          <StatCard label={`${ctx.garage.tax_label} charged`} value={money(r.tax, cur)} />
          <StatCard label="Discounts given" value={money(r.discounts, cur)} />
        </div>
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Revenue by day</CardTitle>
          </CardHeader>
          <CardBody>
            <RevenueChart data={r.paymentsByDay} currency={cur} />
          </CardBody>
        </Card>
        {r.paymentsByMethod.length ? (
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>By payment method</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5 text-sm">
              {r.paymentsByMethod.map((m) => (
                <div key={m.method} className="flex justify-between">
                  <span className="capitalize text-text-muted">{m.method.replace("_", " ")}</span>
                  <span className="text-text">{money(m.amount, cur)}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        ) : null}
      </section>

      {/* Profitability */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Profitability</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Parts billed" value={money(r.partsRevenue, cur)} />
          <StatCard label="Labour billed" value={money(r.laborRevenue, cur)} />
          <StatCard label="Services billed" value={money(r.servicesRevenue, cur)} />
          <StatCard label="Parts cost" value={money(r.partsCost, cur)} tone="amber" />
          <StatCard label="Gross profit" value={money(r.grossProfit, cur)} tone="green" />
        </div>
      </section>

      {/* Operations */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Operations</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Checked in" value={r.jobsCheckedIn} />
          <StatCard label="Completed" value={r.jobsCompleted} />
          <StatCard label="Open now" value={r.jobsOpen} />
          <StatCard label="Avg repair time" value={r.avgRepairHours != null ? `${r.avgRepairHours.toFixed(1)} h` : "—"} />
          <StatCard label="Overdue" value={r.overdue} tone={r.overdue > 0 ? "red" : "gray"} />
        </div>
      </section>

      {/* Technicians */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Technicians</h2>
        {r.technicians.length === 0 ? (
          <p className="text-sm text-text-muted">No technician activity in this period.</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Technician</Th>
                  <Th className="text-right">Jobs worked</Th>
                  <Th className="text-right">Hours logged</Th>
                  <Th className="text-right">Tasks completed</Th>
                </tr>
              </thead>
              <tbody>
                {r.technicians.map((t) => (
                  <tr key={t.name} className="hover:bg-surface-2">
                    <Td className="font-medium text-text">{t.name}</Td>
                    <Td className="text-right">{t.jobs}</Td>
                    <Td className="text-right">{duration(t.hours * 3600)}</Td>
                    <Td className="text-right">{t.tasks}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>

      {/* Customers */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Customers</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <StatCard label="New customers" value={r.newCustomers} />
          <StatCard label="Customers billed" value={r.topCustomers.length} />
        </div>
        {r.topCustomers.length ? (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th className="text-right">Invoices</Th>
                  <Th className="text-right">Paid</Th>
                </tr>
              </thead>
              <tbody>
                {r.topCustomers.map((c) => (
                  <tr key={c.name} className="hover:bg-surface-2">
                    <Td className="font-medium text-text">{c.name}</Td>
                    <Td className="text-right">{c.jobs}</Td>
                    <Td className="text-right">{money(c.spent, cur)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : null}
      </section>

      {/* Inventory */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Inventory</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <StatCard label="Stock value (at cost)" value={money(r.stockValue, cur)} />
          <StatCard label="Low-stock items" value={r.lowStock} tone={r.lowStock > 0 ? "amber" : "gray"} />
        </div>
        {r.partsUsed.length ? (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Part</Th>
                  <Th className="text-right">Qty used</Th>
                  <Th className="text-right">Cost value</Th>
                </tr>
              </thead>
              <tbody>
                {r.partsUsed.map((p) => (
                  <tr key={p.name} className="hover:bg-surface-2">
                    <Td className="font-medium text-text">{p.name}</Td>
                    <Td className="text-right">{p.qty}</Td>
                    <Td className="text-right">{money(p.value, cur)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : (
          <p className="text-sm text-text-muted">No parts used in this period.</p>
        )}
      </section>
    </div>
  );
}
