import { notFound } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Service report" };

const NOTE_LABEL: Record<string, string> = { work: "Work performed", diagnosis: "Diagnosis", note: "Note" };

export default async function ServiceReportPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const g = ctx.garage;

  const { data: wo } = await supabase
    .from("work_orders")
    .select(
      "number, complaint, requested_work, checked_in_at, checked_out_at, customer:customers(name, phone, email), vehicle:vehicles(make, model, year, license_plate, vin)",
    )
    .eq("id", id)
    .eq("garage_id", g.id)
    .maybeSingle();
  if (!wo) notFound();

  const [{ data: tasks }, { data: notes }, { data: checkout }] = await Promise.all([
    supabase.from("work_order_tasks").select("title, status").eq("work_order_id", id).order("sequence"),
    supabase.from("work_order_notes").select("kind, body, created_at").eq("work_order_id", id).order("created_at"),
    supabase
      .from("checkouts")
      .select("customer_notes, created_at")
      .eq("work_order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const c = wo.customer as unknown as { name: string; phone: string; email: string | null } | null;
  const v = wo.vehicle as unknown as { make: string; model: string; year: number; license_plate: string; vin: string } | null;
  const done = (tasks ?? []).filter((t) => t.status === "completed");
  const open = (tasks ?? []).filter((t) => t.status !== "completed");

  return (
    <div className="mx-auto max-w-[700px] bg-white p-10 text-[13px] text-black">
      <style>{`@media print{.no-print{display:none}body{background:#fff}}`}</style>
      <div className="no-print mb-3"><PrintButton /></div>

      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{g.name}</h1>
          <p style={{ margin: 0 }}>{g.address}</p>
          <p style={{ margin: 0 }}>{g.phone}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>SERVICE REPORT</h2>
          <p style={{ fontFamily: "monospace", margin: "2px 0" }}>{wo.number as string}</p>
          <p style={{ margin: 0 }}>{wo.checked_out_at ? dateTime(wo.checked_out_at as string) : "—"}</p>
        </div>
      </div>

      <table style={{ width: "100%", marginTop: 12, fontSize: 13 }}>
        <tbody>
          <tr><td style={{ padding: "3px 0", width: 160, color: "#444" }}>Customer</td><td>{c?.name} {c?.phone ? `· ${c.phone}` : ""}{c?.email ? ` · ${c.email}` : ""}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>Vehicle</td><td>{v?.year} {v?.make} {v?.model} — {v?.license_plate}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>VIN</td><td>{v?.vin || "—"}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>Checked in</td><td>{wo.checked_in_at ? dateTime(wo.checked_in_at as string) : "—"}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>Collected</td><td>{wo.checked_out_at ? dateTime(wo.checked_out_at as string) : "—"}</td></tr>
        </tbody>
      </table>

      <div style={{ marginTop: 14 }}>
        <p style={{ fontWeight: 700, margin: "0 0 3px" }}>Customer reported</p>
        <p style={{ margin: 0 }}>{(wo.complaint as string) || (wo.requested_work as string) || "—"}</p>
      </div>

      <div style={{ marginTop: 14 }}>
        <p style={{ fontWeight: 700, margin: "0 0 3px" }}>Work completed</p>
        {done.length ? done.map((t, i) => <p key={i} style={{ margin: "1px 0" }}>[x] {t.title as string}</p>) : <p style={{ margin: 0, color: "#666" }}>None logged.</p>}
        {open.length ? (
          <>
            <p style={{ fontWeight: 700, margin: "8px 0 3px" }}>Still open</p>
            {open.map((t, i) => <p key={i} style={{ margin: "1px 0" }}>[ ] {t.title as string}</p>)}
          </>
        ) : null}
      </div>

      {(notes ?? []).length ? (
        <div style={{ marginTop: 14, border: "1px solid #999", borderRadius: 4, padding: 10 }}>
          <p style={{ fontWeight: 700, margin: "0 0 4px" }}>Technician work log</p>
          {(notes ?? []).map((n, i) => (
            <p key={i} style={{ margin: "3px 0" }}>
              <span style={{ color: "#444" }}>[{NOTE_LABEL[n.kind as string] ?? n.kind as string} · {dateTime(n.created_at as string)}]</span>{" "}
              {n.body as string}
            </p>
          ))}
        </div>
      ) : null}

      {checkout?.customer_notes ? (
        <div style={{ marginTop: 14, border: "1px solid #b54708", borderRadius: 4, padding: 10, background: "#fef6e7" }}>
          <p style={{ fontWeight: 700, margin: "0 0 4px", color: "#b54708" }}>Recommendations given to customer</p>
          <p style={{ margin: 0 }}>{checkout.customer_notes as string}</p>
        </div>
      ) : null}

      <p style={{ marginTop: 20, fontSize: 11, color: "#666" }}>
        This report was also emailed to the customer{c?.email ? ` at ${c.email}` : ""} and is available in their
        online portal.
      </p>
    </div>
  );
}
