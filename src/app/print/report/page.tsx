import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildReport, rangeToDates } from "@/lib/reports";
import { money, shortDate, duration } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Report" };

export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "reports.view")) redirect("/dashboard");
  const { range = "30d" } = await searchParams;
  const r = await buildReport(ctx.garage.id, ctx.garage.currency, range);
  const { from, to } = rangeToDates(range);
  const g = ctx.garage;
  const cur = g.currency;

  const Section = ({ title, rows }: { title: string; rows: [string, string][] }) => (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 3, margin: "0 0 6px" }}>
        {title}
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: "2px 0", color: "#444" }}>{k}</td>
              <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 500 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-[800px] bg-white p-10 text-[13px] text-black">
      <style>{`@media print { .no-print{display:none} body{background:#fff} }`}</style>
      <div className="no-print mb-4">
        <PrintButton />
      </div>

      <div style={{ borderBottom: "2px solid #000", paddingBottom: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{g.name}</h1>
        <p style={{ margin: "2px 0" }}>Management report</p>
        <p style={{ margin: 0, color: "#444" }}>
          {shortDate(from)} – {shortDate(to)}
        </p>
      </div>

      <Section
        title="Financial"
        rows={[
          ["Revenue collected", money(r.revenue, cur)],
          ["Outstanding (all time)", money(r.outstanding, cur)],
          [`${g.tax_label} charged`, money(r.tax, cur)],
          ["Discounts given", money(r.discounts, cur)],
          ...r.paymentsByMethod.map((m) => [`  via ${m.method.replace("_", " ")}`, money(m.amount, cur)] as [string, string]),
        ]}
      />
      <Section
        title="Profitability"
        rows={[
          ["Parts billed", money(r.partsRevenue, cur)],
          ["Labour billed", money(r.laborRevenue, cur)],
          ["Services billed", money(r.servicesRevenue, cur)],
          ["Parts cost", money(r.partsCost, cur)],
          ["Gross profit", money(r.grossProfit, cur)],
        ]}
      />
      <Section
        title="Operations"
        rows={[
          ["Checked in", String(r.jobsCheckedIn)],
          ["Completed", String(r.jobsCompleted)],
          ["Open now", String(r.jobsOpen)],
          ["Average repair time", r.avgRepairHours != null ? `${r.avgRepairHours.toFixed(1)} h` : "—"],
          ["Overdue", String(r.overdue)],
        ]}
      />

      <div style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 3, margin: "0 0 6px" }}>
          Technicians
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #999", textAlign: "left" }}>
              <th style={{ padding: "3px 0" }}>Technician</th>
              <th style={{ padding: "3px 0", textAlign: "right" }}>Jobs</th>
              <th style={{ padding: "3px 0", textAlign: "right" }}>Hours</th>
              <th style={{ padding: "3px 0", textAlign: "right" }}>Tasks</th>
            </tr>
          </thead>
          <tbody>
            {r.technicians.map((t) => (
              <tr key={t.name} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "3px 0" }}>{t.name}</td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{t.jobs}</td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{duration(t.hours * 3600)}</td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{t.tasks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 3, margin: "0 0 6px" }}>
          Top customers
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {r.topCustomers.map((c) => (
              <tr key={c.name} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "3px 0" }}>{c.name}</td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>
                  {c.jobs} inv · {money(c.spent, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 3, margin: "0 0 6px" }}>
          Inventory
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            <tr>
              <td style={{ padding: "2px 0", color: "#444" }}>Stock value (at cost)</td>
              <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 500 }}>{money(r.stockValue, cur)}</td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0", color: "#444" }}>Low-stock items</td>
              <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 500 }}>{r.lowStock}</td>
            </tr>
            {r.partsUsed.map((p) => (
              <tr key={p.name} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "2px 0" }}>{p.name} × {p.qty}</td>
                <td style={{ padding: "2px 0", textAlign: "right" }}>{money(p.value, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 30, fontSize: 11, color: "#888", textAlign: "center" }}>
        Generated {shortDate(new Date())} · GarageFlow
      </p>
    </div>
  );
}
