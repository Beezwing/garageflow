import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Parts" };
export default function Page() {
  return (
    <PhaseStub
      title="Parts & inventory"
      phase={5}
      summary="Stock levels, cost and selling price, minimum-stock alerts, receive/adjust movements, a full transaction history, and automatic deduction when a technician uses a part on a job."
    />
  );
}
