import { NextResponse, type NextRequest } from "next/server";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

function csvRow(cells: (string | number | boolean | null)[]): string {
  return cells
    .map((c) => {
      const s = c === null || c === undefined ? "" : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

const HEADERS = ["name", "category", "default_price", "est_labor_minutes", "description", "active"];

export async function GET(request: NextRequest) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "service.manage")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const mode = new URL(request.url).searchParams.get("mode") ?? "template";
  const lines = [csvRow(HEADERS)];

  if (mode === "current") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("services")
      .select("name, category, default_price, est_labor_minutes, description, active")
      .eq("garage_id", ctx.garage.id)
      .order("category", { nullsFirst: false })
      .order("name");
    for (const s of data ?? []) {
      lines.push(
        csvRow([
          s.name as string,
          (s.category as string) ?? "",
          Number(s.default_price),
          Number(s.est_labor_minutes),
          (s.description as string) ?? "",
          s.active ? "yes" : "no",
        ]),
      );
    }
  } else {
    // template with a few illustrative rows
    lines.push(csvRow(["Oil & filter change", "Maintenance", 6500, 45, "Up to 5L semi-synthetic", "yes"]));
    lines.push(csvRow(["Front brake pads", "Brakes", 9500, 90, "Pads only, per axle", "yes"]));
    lines.push(csvRow(["Diagnostic scan", "Diagnostics", 3500, 30, "OBD-II fault read + report", "yes"]));
    lines.push(csvRow(["Wheel alignment", "Tyres", 4000, 60, "", "yes"]));
  }

  const filename =
    mode === "current"
      ? `services-${ctx.garage.slug}.csv`
      : "services-template.csv";

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
