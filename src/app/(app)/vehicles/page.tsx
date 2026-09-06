import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Vehicles" };
export default function Page() {
  return (
    <PhaseStub
      title="Vehicles"
      phase={2}
      summary="Search by plate, VIN, engine number, customer or phone. Each vehicle shows a permanent service history, before/after photos and historical notes."
    />
  );
}
