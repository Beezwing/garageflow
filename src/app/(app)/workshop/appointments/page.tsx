import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Appointments" };
export default function Page() {
  return (
    <PhaseStub
      title="Appointments"
      phase={6}
      summary="Scheduling with statuses (scheduled, confirmed, arrived, completed, cancelled, no-show) and one-tap conversion of an appointment into a vehicle check-in."
    />
  );
}
