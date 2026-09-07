import { notFound } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, dateTime, shortDate } from "@/lib/format";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/status";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Work order" };

const box: React.CSSProperties = { border: "1px solid #999", borderRadius: 4, padding: 8, marginTop: 10 };
const h2: React.CSSProperties = { fontSize: 13, margin: "0 0 4px", borderBottom: "1px solid #000", paddingBottom: 2 };

export default async function WorkOrderPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const g = ctx.garage;
  const cur = g.currency;

  const { data: wo } = await supabase
    .from("work_orders")
    .select("*, customer:customers(name, phone, email, address), vehicle:vehicles(make, model, year, license_plate, vin, engine_number, mileage)")
    .eq("id", id)
    .eq("garage_id", g.id)
    .maybeSingle();
  if (!wo) notFound();

  const [{ data: insp }, { data: tasks }, { data: parts }, { data: labor }, { data: services }, { data: awrs }, { data: notes }, { data: assigns }, { data: members }] =
    await Promise.all([
      supabase.from("inspections").select("*, damages:inspection_damages(*)").eq("work_order_id", id).eq("kind", "checkin").maybeSingle(),
      supabase.from("work_order_tasks").select("title, status, unable_reason").eq("work_order_id", id).order("sequence"),
      supabase.from("work_order_parts").select("description, quantity, unit_price, amount").eq("work_order_id", id),
      supabase.from("work_order_labor").select("description, hours, rate, amount").eq("work_order_id", id),
      supabase.from("work_order_services").select("description, quantity, unit_price, amount").eq("work_order_id", id),
      supabase.from("additional_work_requests").select("problem, price, status").eq("work_order_id", id),
      supabase.from("work_order_notes").select("body, kind, created_at, author_id").eq("work_order_id", id).order("created_at"),
      supabase.from("technician_assignments").select("technician_id, scope").eq("work_order_id", id),
      supabase.from("memberships").select("user_id").eq("garage_id", g.id),
    ]);

  const ids = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) || "—"]));

  const c = wo.customer as unknown as { name: string; phone: string; email: string; address: string } | null;
  const v = wo.vehicle as unknown as { make: string; model: string; year: number; license_plate: string; vin: string; engine_number: string; mileage: number } | null;
  const checklist = (insp?.checklist as { section?: string; item: string; status: string }[]) ?? [];
  const damages = (insp?.damages as unknown as { damage_type: string; view: string; description: string }[]) ?? [];
  const total =
    (parts ?? []).reduce((t, p) => t + Number(p.amount), 0) +
    (labor ?? []).reduce((t, l) => t + Number(l.amount), 0) +
    (services ?? []).reduce((t, s) => t + Number(s.amount), 0);

  return (
    <div className="mx-auto max-w-[820px] bg-white p-10 text-[12px] text-black">
      <style>{`@media print{.no-print{display:none}body{background:#fff}}`}</style>
      <div className="no-print mb-3"><PrintButton /></div>

      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{g.name}</h1>
          <p style={{ margin: "1px 0" }}>{g.address}</p>
          <p style={{ margin: 0 }}>{g.phone} {g.email ? `· ${g.email}` : ""}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>WORK ORDER</h2>
          <p style={{ fontFamily: "monospace", margin: "2px 0" }}>{wo.number as string}</p>
          <p style={{ margin: 0 }}>{shortDate(wo.checked_in_at as string)}</p>
          <p style={{ margin: 0 }}>Status: {WORK_ORDER_STATUS_LABELS[wo.status as keyof typeof WORK_ORDER_STATUS_LABELS]}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div style={box}>
          <h2 style={h2}>Customer</h2>
          <p style={{ margin: "1px 0" }}>{c?.name}</p>
          <p style={{ margin: "1px 0" }}>{c?.phone} {c?.email ? `· ${c.email}` : ""}</p>
          {c?.address ? <p style={{ margin: "1px 0" }}>{c.address}</p> : null}
        </div>
        <div style={box}>
          <h2 style={h2}>Vehicle</h2>
          <p style={{ margin: "1px 0" }}>{v?.year} {v?.make} {v?.model}</p>
          <p style={{ margin: "1px 0" }}>Plate {v?.license_plate} · VIN {v?.vin || "—"}</p>
          <p style={{ margin: "1px 0" }}>Engine {v?.engine_number || "—"} · Mileage in {wo.mileage_in ? Number(wo.mileage_in).toLocaleString() : "—"} km · Fuel {wo.fuel_level_in ?? "—"}%</p>
        </div>
      </div>

      <div style={box}>
        <h2 style={h2}>Complaint / requested work</h2>
        <p style={{ margin: "1px 0", whiteSpace: "pre-wrap" }}>{(wo.complaint as string) || "—"}</p>
        {wo.requested_work ? <p style={{ margin: "3px 0", whiteSpace: "pre-wrap" }}>{wo.requested_work as string}</p> : null}
      </div>

      {checklist.length || damages.length ? (
        <div style={box}>
          <h2 style={h2}>Intake inspection</h2>
          {checklist.length ? (
            <p style={{ margin: "1px 0" }}>
              Attention: {checklist.filter((x) => x.status === "attention").map((x) => x.item).join(", ") || "none"}
            </p>
          ) : null}
          {damages.length ? (
            <ul style={{ margin: "3px 0", paddingLeft: 16 }}>
              {damages.map((d, i) => (
                <li key={i} style={{ textTransform: "capitalize" }}>
                  {d.damage_type} ({d.view}){d.description ? ` — ${d.description}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {insp?.notes ? <p style={{ margin: "3px 0", fontStyle: "italic" }}>{insp.notes as string}</p> : null}
        </div>
      ) : null}

      <div style={box}>
        <h2 style={h2}>Technicians</h2>
        {(assigns ?? []).map((a, i) => (
          <p key={i} style={{ margin: "1px 0" }}>
            {nameById.get(a.technician_id as string) ?? "—"}{a.scope ? ` — ${a.scope}` : ""}
          </p>
        ))}
        {(assigns ?? []).length === 0 ? <p style={{ margin: 0 }}>—</p> : null}
      </div>

      {(tasks ?? []).length ? (
        <div style={box}>
          <h2 style={h2}>Repair tasks</h2>
          {(tasks ?? []).map((t, i) => (
            <p key={i} style={{ margin: "1px 0" }}>
              [{t.status === "completed" ? "x" : " "}] {t.title as string}
              {t.unable_reason ? ` — could not complete: ${t.unable_reason}` : ""}
            </p>
          ))}
        </div>
      ) : null}

      {(notes ?? []).length ? (
        <div style={box}>
          <h2 style={h2}>Work performed / notes</h2>
          {(notes ?? []).map((n, i) => (
            <p key={i} style={{ margin: "2px 0" }}>
              <strong>{nameById.get(n.author_id as string) ?? "—"}</strong> ({dateTime(n.created_at as string)}
              {n.kind !== "work" ? `, ${n.kind}` : ""}): {n.body as string}
            </p>
          ))}
        </div>
      ) : null}

      {(awrs ?? []).length ? (
        <div style={box}>
          <h2 style={h2}>Additional work</h2>
          {(awrs ?? []).map((a, i) => (
            <p key={i} style={{ margin: "1px 0" }}>
              {a.problem as string} — {money(Number(a.price), cur)} ({a.status as string})
            </p>
          ))}
        </div>
      ) : null}

      <div style={box}>
        <h2 style={h2}>Charges</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[...(parts ?? []).map((p) => ["Part", p.description, p.amount] as const),
              ...(labor ?? []).map((l) => ["Labour", l.description, l.amount] as const),
              ...(services ?? []).map((s) => ["Service", s.description, s.amount] as const)].map(([k, d, amt], i) => (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "2px 0", width: 60 }}>{k}</td>
                <td style={{ padding: "2px 0" }}>{d as string}</td>
                <td style={{ padding: "2px 0", textAlign: "right" }}>{money(Number(amt), cur)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={2} style={{ padding: "4px 0" }}>Subtotal (before {g.tax_label})</td>
              <td style={{ padding: "4px 0", textAlign: "right" }}>{money(total, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 40 }}>
        <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>Technician signature</div>
        <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>Supervisor signature</div>
      </div>
    </div>
  );
}
