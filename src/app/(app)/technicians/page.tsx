import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Technicians" };
export default function Page() {
  return (
    <PhaseStub
      title="Technicians"
      phase={3}
      summary="Technician workload, availability, jobs assigned, hours worked and productivity. Assign multiple technicians to a single work order."
    />
  );
}
