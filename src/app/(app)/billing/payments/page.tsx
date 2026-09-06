import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Payments" };
export default function Page() {
  return (
    <PhaseStub
      title="Payments"
      phase={6}
      summary="Record cash, card, bank-transfer and online payments, including partial payments that roll an invoice to Paid automatically. Provider-agnostic so a Jamaican gateway can be added later."
    />
  );
}
