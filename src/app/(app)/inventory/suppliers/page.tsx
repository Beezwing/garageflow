import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Suppliers" };
export default function Page() {
  return (
    <PhaseStub
      title="Suppliers"
      phase={5}
      summary="Supplier directory with parts supplied, purchase history and amount spent."
    />
  );
}
