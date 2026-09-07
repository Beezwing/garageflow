import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { ChecklistEditor } from "./ChecklistEditor";

export const metadata = { title: "Checklists" };

const DEFAULTS: Record<string, { name: string; items: string[] }> = {
  inspection: {
    name: "Intake inspection",
    items: [
      "Front bumper",
      "Rear bumper",
      "Hood",
      "Windshield",
      "Headlights",
      "Tail lights",
      "Tyres & wheels",
      "Body panels",
      "Seats & interior",
      "Dashboard warning lights",
      "A/C",
      "Engine oil level",
      "Coolant level",
      "Battery",
      "Visible leaks",
      "Personal belongings removed",
    ],
  },
  repair: {
    name: "Standard repair steps",
    items: ["Diagnose issue", "Remove damaged component", "Install replacement", "Test component", "Road test", "Verify repair", "Clean work area"],
  },
  quality: {
    name: "Quality control",
    items: [
      "Requested repairs completed",
      "Repair checklist completed",
      "Additional approved work completed",
      "Vehicle road tested",
      "Warning lights checked",
      "No tools or materials left in vehicle",
      "Vehicle condition acceptable",
      "Ready for customer",
    ],
  },
  checkout: {
    name: "Vehicle release",
    items: [
      "Repairs completed",
      "Technician checklist completed",
      "Quality inspection completed",
      "Approved additional work completed",
      "Invoice settled",
      "Customer belongings checked",
      "Keys ready",
      "Customer identified",
    ],
  },
};

export default async function ChecklistsPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "settings.manage")) redirect("/settings");
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("checklist_templates")
    .select("kind, name, items")
    .eq("garage_id", ctx.garage.id)
    .eq("is_default", true);

  const byKind = new Map((rows ?? []).map((r) => [r.kind as string, r]));

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-text-muted">
        These lists drive check-in inspections, repair task templates, quality control and vehicle
        release. Edit them to match how your shop works.
      </p>
      {(["inspection", "repair", "quality", "checkout"] as const).map((kind) => {
        const row = byKind.get(kind);
        return (
          <ChecklistEditor
            key={kind}
            kind={kind}
            title={
              kind === "inspection"
                ? "Check-in inspection"
                : kind === "repair"
                  ? "Repair steps template"
                  : kind === "quality"
                    ? "Quality control"
                    : "Vehicle checkout"
            }
            name={(row?.name as string) ?? DEFAULTS[kind].name}
            items={((row?.items as string[]) ?? DEFAULTS[kind].items)}
          />
        );
      })}
    </div>
  );
}
