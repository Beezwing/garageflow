import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Services & pricing" };
export default function Page() {
  return (
    <PhaseStub
      title="Services & pricing"
      phase={3}
      summary="A customisable service catalogue with categories, default prices and estimated labour time. Preset prices are optional — staff can always override or enter a custom charge."
    />
  );
}
