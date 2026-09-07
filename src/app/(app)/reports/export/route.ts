import { NextResponse, type NextRequest } from "next/server";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildReport } from "@/lib/reports";

function csvRow(cells: (string | number)[]): string {
  return cells
    .map((c) => {
      const s = String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

export async function GET(request: NextRequest) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "reports.view")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const range = new URL(request.url).searchParams.get("range") ?? "30d";
  const r = await buildReport(ctx.garage.id, ctx.garage.currency, range);

  const lines: string[] = [];
  lines.push(csvRow(["GarageFlow report", ctx.garage.name, `range: last ${r.range}`]));
  lines.push("");
  lines.push(csvRow(["Financial", "", ""]));
  lines.push(csvRow(["Revenue collected", r.revenue, r.currency]));
  lines.push(csvRow(["Outstanding (all time)", r.outstanding, r.currency]));
  lines.push(csvRow([`${ctx.garage.tax_label} charged`, r.tax, r.currency]));
  lines.push(csvRow(["Discounts", r.discounts, r.currency]));
  lines.push("");
  lines.push(csvRow(["Profitability", "", ""]));
  lines.push(csvRow(["Parts billed", r.partsRevenue]));
  lines.push(csvRow(["Labour billed", r.laborRevenue]));
  lines.push(csvRow(["Services billed", r.servicesRevenue]));
  lines.push(csvRow(["Parts cost", r.partsCost]));
  lines.push(csvRow(["Gross profit", r.grossProfit]));
  lines.push("");
  lines.push(csvRow(["Operations", "", ""]));
  lines.push(csvRow(["Checked in", r.jobsCheckedIn]));
  lines.push(csvRow(["Completed", r.jobsCompleted]));
  lines.push(csvRow(["Open now", r.jobsOpen]));
  lines.push(csvRow(["Avg repair hours", r.avgRepairHours != null ? r.avgRepairHours.toFixed(2) : ""]));
  lines.push(csvRow(["Overdue", r.overdue]));
  lines.push("");
  lines.push(csvRow(["Revenue by day", "", ""]));
  lines.push(csvRow(["Date", "Amount"]));
  r.paymentsByDay.forEach((d) => lines.push(csvRow([d.date, d.amount])));
  lines.push("");
  lines.push(csvRow(["Technicians", "", "", ""]));
  lines.push(csvRow(["Name", "Jobs", "Hours", "Tasks completed"]));
  r.technicians.forEach((t) => lines.push(csvRow([t.name, t.jobs, t.hours.toFixed(2), t.tasks])));
  lines.push("");
  lines.push(csvRow(["Top customers", "", ""]));
  lines.push(csvRow(["Name", "Invoices", "Paid"]));
  r.topCustomers.forEach((c) => lines.push(csvRow([c.name, c.jobs, c.spent])));
  lines.push("");
  lines.push(csvRow(["Parts used", "", ""]));
  lines.push(csvRow(["Name", "Qty", "Cost value"]));
  r.partsUsed.forEach((p) => lines.push(csvRow([p.name, p.qty, p.value])));

  const body = lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="garageflow-report-${r.range}.csv"`,
    },
  });
}
