import { PhaseStub } from "@/components/PhaseStub";
export const metadata = { title: "My jobs" };
export default function Page() {
  return (
    <PhaseStub
      title="My jobs"
      phase={3}
      summary="Technician mobile dashboard: assigned jobs, tasks, start/stop time tracking, parts and additional-work requests."
    />
  );
}
