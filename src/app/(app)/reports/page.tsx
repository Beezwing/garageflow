import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Reports" };
export default function Page() {
  return (
    <PhaseStub
      title="Reports"
      phase={7}
      summary="Financial, profitability, inventory, operations, technician and customer reports with date/technician/service filters and PDF / CSV / Excel export."
    />
  );
}
