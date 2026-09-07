import { notFound } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, shortDate } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Invoice" };

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireGarageContext();
  const supabase = await createClient();
  const g = ctx.garage;

  const { data: inv } = await supabase
    .from("invoices")
    .select("*, customer:customers(name, phone, email, address), work_order:work_orders(number, vehicle:vehicles(make, model, year, license_plate, vin))")
    .eq("id", id)
    .eq("garage_id", g.id)
    .maybeSingle();
  if (!inv) notFound();

  const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at");
  const c = inv.customer as unknown as { name: string; phone: string; email: string; address: string } | null;
  const w = inv.work_order as unknown as { number: string; vehicle: { make: string; model: string; year: number; license_plate: string; vin: string } | null } | null;

  return (
    <div className="mx-auto max-w-[800px] bg-white p-10 text-[13px] text-black">
      <style>{`@media print { .no-print { display:none } body { background:#fff } }`}</style>
      <div className="no-print mb-4">
        <PrintButton />
      </div>

      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          {g.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.logo_url} alt={g.name} className="mb-2 h-12" />
          ) : null}
          <h1 className="text-xl font-bold">{g.name}</h1>
          <p>{g.address}</p>
          <p>
            {g.phone} {g.email ? `· ${g.email}` : ""}
          </p>
          {g.tax_number ? <p>{g.tax_label} #: {g.tax_number}</p> : null}
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold uppercase">Invoice</h2>
          <p className="font-mono">{inv.number as string}</p>
          <p>{inv.issued_at ? shortDate(inv.issued_at as string) : "Draft"}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="font-semibold">Bill to</p>
          <p>{c?.name}</p>
          {c?.address ? <p>{c.address}</p> : null}
          <p>
            {c?.phone} {c?.email ? `· ${c.email}` : ""}
          </p>
        </div>
        <div>
          <p className="font-semibold">Vehicle</p>
          {w?.vehicle ? (
            <>
              <p>
                {w.vehicle.year} {w.vehicle.make} {w.vehicle.model}
              </p>
              <p>Plate: {w.vehicle.license_plate}</p>
              {w.vehicle.vin ? <p>VIN: {w.vehicle.vin}</p> : null}
            </>
          ) : null}
          {w ? <p>Job: {w.number}</p> : null}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1">Description</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Unit</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((it) => (
            <tr key={it.id as string} className="border-b border-gray-300">
              <td className="py-1.5">{it.description as string}</td>
              <td className="py-1.5 text-right">{Number(it.quantity)}</td>
              <td className="py-1.5 text-right">{money(Number(it.unit_price), g.currency)}</td>
              <td className="py-1.5 text-right">{money(Number(it.amount), g.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <table className="w-64">
          <tbody>
            <tr>
              <td className="py-0.5">Subtotal</td>
              <td className="py-0.5 text-right">{money(Number(inv.subtotal), g.currency)}</td>
            </tr>
            {Number(inv.discount) > 0 ? (
              <tr>
                <td className="py-0.5">Discount</td>
                <td className="py-0.5 text-right">- {money(Number(inv.discount), g.currency)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="py-0.5">
                {g.tax_label} ({(Number(inv.tax_rate) * 100).toFixed(0)}%)
              </td>
              <td className="py-0.5 text-right">{money(Number(inv.tax), g.currency)}</td>
            </tr>
            <tr className="border-t-2 border-black text-base font-bold">
              <td className="py-1">Total</td>
              <td className="py-1 text-right">{money(Number(inv.total), g.currency)}</td>
            </tr>
            <tr>
              <td className="py-0.5">Paid</td>
              <td className="py-0.5 text-right">{money(Number(inv.paid_amount), g.currency)}</td>
            </tr>
            <tr className="font-bold">
              <td className="py-0.5">Balance due</td>
              <td className="py-0.5 text-right">{money(Number(inv.balance), g.currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-10 text-center text-xs text-gray-500">Thank you for your business.</p>
    </div>
  );
}
