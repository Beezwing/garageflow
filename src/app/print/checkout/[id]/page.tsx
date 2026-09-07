import { notFound } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, shortDate } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Vehicle release" };

export default async function CheckoutPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const g = ctx.garage;

  const { data: wo } = await supabase
    .from("work_orders")
    .select("number, mileage_out, checked_out_at, customer:customers(name, phone), vehicle:vehicles(make, model, year, license_plate, vin)")
    .eq("id", id)
    .eq("garage_id", g.id)
    .maybeSingle();
  if (!wo) notFound();

  const { data: co } = await supabase
    .from("checkouts")
    .select("*, released:profiles(full_name)")
    .eq("work_order_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const c = wo.customer as unknown as { name: string; phone: string } | null;
  const v = wo.vehicle as unknown as { make: string; model: string; year: number; license_plate: string; vin: string } | null;
  const rel = co?.released as unknown as { full_name: string } | null;
  const checklist = (co?.checklist as { item: string; checked: boolean }[]) ?? [];

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
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>VEHICLE RELEASE</h2>
          <p style={{ fontFamily: "monospace", margin: "2px 0" }}>{wo.number as string}</p>
          <p style={{ margin: 0 }}>{co ? shortDate(co.created_at as string) : "—"}</p>
        </div>
      </div>

      <table style={{ width: "100%", marginTop: 12, fontSize: 13 }}>
        <tbody>
          <tr><td style={{ padding: "3px 0", width: 160, color: "#444" }}>Customer</td><td>{c?.name} {c?.phone ? `· ${c.phone}` : ""}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>Vehicle</td><td>{v?.year} {v?.make} {v?.model} — {v?.license_plate}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>VIN</td><td>{v?.vin || "—"}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>Collected by</td><td>{(co?.collected_by_name as string) || "—"} ({(co?.relationship as string) || "—"})</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>ID verified</td><td>{co?.id_verified ? "Yes" : "No"}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>Final mileage</td><td>{co?.final_mileage ? `${Number(co.final_mileage).toLocaleString()} km` : "—"}</td></tr>
          <tr><td style={{ padding: "3px 0", color: "#444" }}>Released by</td><td>{rel?.full_name ?? "—"} · {co ? dateTime(co.created_at as string) : "—"}</td></tr>
          {co?.override_id ? <tr><td style={{ padding: "3px 0", color: "#b00" }}>Checkout override</td><td style={{ color: "#b00" }}>Applied — balance outstanding</td></tr> : null}
        </tbody>
      </table>

      {checklist.length ? (
        <div style={{ marginTop: 12, border: "1px solid #999", borderRadius: 4, padding: 10 }}>
          <p style={{ fontWeight: 700, margin: "0 0 4px" }}>Release checklist</p>
          {checklist.map((x, i) => (
            <p key={i} style={{ margin: "1px 0" }}>[{x.checked ? "x" : " "}] {x.item}</p>
          ))}
        </div>
      ) : null}

      {co?.notes ? <p style={{ marginTop: 10, fontStyle: "italic" }}>{co.notes as string}</p> : null}

      <p style={{ marginTop: 20, fontSize: 12 }}>
        I confirm I have received the vehicle described above in acceptable condition and that all agreed
        work has been completed to my satisfaction.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 50 }}>
        <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>Customer signature</div>
        <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>Staff signature</div>
      </div>
    </div>
  );
}
