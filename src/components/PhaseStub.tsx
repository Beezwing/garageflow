import { PageHeader, EmptyState } from "@/components/ui/primitives";

export function PhaseStub({
  title,
  phase,
  summary,
}: {
  title: string;
  phase: number;
  summary: string;
}) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState
        title={`Arriving in Phase ${phase}`}
        description={summary}
      />
    </div>
  );
}
