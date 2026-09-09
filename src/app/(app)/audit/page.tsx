import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { dateTime } from "@/lib/format";
import {
  PageHeader,
  EmptyState,
  TableWrap,
  Table,
  Th,
  Td,
  Badge,
} from "@/components/ui/primitives";

export const metadata = { title: "Audit log" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "audit.view")) redirect("/dashboard");

  const { page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));
  const pageSize = 50;
  const from = (pageNum - 1) * pageSize;

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("garage_id", ctx.garage.id)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  // profiles can't be embedded from audit_logs.user_id (FK → auth.users) — fetch + join
  const actorIds = [...new Set(rows.map((r) => r.user_id as string | null).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const actorName = new Map((actors ?? []).map((a) => [a.id as string, a.full_name as string | null]));

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every important action is recorded here and cannot be edited."
      />
      {rows.length === 0 ? (
        <EmptyState title="No audit entries yet" description="Activity will appear here as your team uses GarageFlow." />
      ) : (
        <>
          <TableWrap cards>
            <Table className="gf-table-cards">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id as string} className="hover:bg-surface-2">
                    <Td className="whitespace-nowrap text-text-muted">{dateTime(r.created_at as string)}</Td>
                    <Td label="Actor">{actorName.get(r.user_id as string) || "—"}</Td>
                    <Td label="Action">
                      <Badge tone="blue">{r.action as string}</Badge>
                    </Td>
                    <Td label="Entity" className="text-text-muted">
                      {r.entity_type ? `${r.entity_type}` : "—"}
                    </Td>
                    <Td label="Reason" className="text-text-muted">{(r.reason as string) || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm text-text-muted">
              <span>
                Page {pageNum} of {totalPages}
              </span>
              <div className="flex gap-2">
                {pageNum > 1 ? (
                  <a className="text-brand hover:underline" href={`/audit?page=${pageNum - 1}`}>
                    Previous
                  </a>
                ) : null}
                {pageNum < totalPages ? (
                  <a className="text-brand hover:underline" href={`/audit?page=${pageNum + 1}`}>
                    Next
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
