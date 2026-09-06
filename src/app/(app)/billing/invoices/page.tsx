import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Invoices" };
export default function Page() {
  return (
    <PhaseStub
      title="Invoices"
      phase={6}
      summary="Invoices built from a work order's labour, parts and services with editable pricing, discounts and GCT. Statuses: draft, unpaid, partially paid, paid, cancelled, refunded."
    />
  );
}
