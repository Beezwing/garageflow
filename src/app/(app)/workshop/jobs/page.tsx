import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "Active jobs" };
export default function Page() {
  return (
    <PhaseStub
      title="Active jobs"
      phase={2}
      summary="Every work order with filters by status, priority, technician and date. Full job cards with tasks, parts, labour, approvals, quality control and checkout arrive across Phases 2–6."
    />
  );
}
