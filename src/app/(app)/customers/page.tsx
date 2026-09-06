import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Customers" };
export default function Page() {
  return (
    <PhaseStub
      title="Customers"
      phase={2}
      summary="Customer profiles with vehicles, service history, invoices, payments and outstanding balance — plus duplicate-prevention on phone and email."
    />
  );
}
