import Link from "next/link";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { relativeTime } from "@/lib/format";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TONE,
  PRIORITY_LABELS,
  PRIORITY_TONE,
  OPEN_STATUSES,
} from "@/lib/status";
import {
  PageHeader,
  EmptyState,
  Badge,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";
import { SearchBar } from "@/components/ui/SearchBar";
import { JobsFilter } from "./JobsFilter";

export const metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; q?: string; scope?: string }>;
}) {
  const ctx = await requireGarageContext();
  const { status, priority, q, scope } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("work_orders")
    .select(
      "id, number, status, priority, complaint, checked_in_at, customer:customers(name), vehicle:vehicles(make, model, license_plate)",
    )
    .eq("garage_id", ctx.garage.id)
    .order("checked_in_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  else if (scope === "closed") query = query.in("status", ["checked_out", "cancelled"]);
  else if (scope !== "all") query = query.in("status", OPEN_STATUSES);

  if (priority) query = query.eq("priority", priority);
  if (q) query = query.ilike("number", `%${q}%`);

  const { data: orders } = await query;

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Every work order in the garage."
        actions={
          can(ctx.role, "vehicle.checkin") ? <ButtonLink href="/workshop/check-in">Check in vehicle</ButtonLink> : null
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBar placeholder="Job number…" />
        <JobsFilter />
      </div>

      {(orders ?? []).length === 0 ? (
        <EmptyState title="No jobs match" description="Adjust the filters, or check a vehicle in." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Job</Th>
                <Th>Vehicle</Th>
                <Th>Customer</Th>
                <Th>Complaint</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Age</Th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((o) => {
                const v = o.vehicle as unknown as { make: string; model: string; license_plate: string } | null;
                const c = o.customer as unknown as { name: string } | null;
                return (
                  <tr key={o.id as string} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/workshop/jobs/${o.id}`} className="font-medium text-brand hover:underline">
                        {o.number as string}
                      </Link>
                    </Td>
                    <Td className="text-text-muted">
                      {v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() : "—"}
                      {v?.license_plate ? <span className="text-text-subtle"> · {v.license_plate}</span> : null}
                    </Td>
                    <Td className="text-text-muted">{c?.name ?? "—"}</Td>
                    <Td className="max-w-xs truncate text-text-muted">{(o.complaint as string) ?? "—"}</Td>
                    <Td>
                      <Badge tone={WORK_ORDER_STATUS_TONE[o.status as keyof typeof WORK_ORDER_STATUS_TONE]}>
                        {WORK_ORDER_STATUS_LABELS[o.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={PRIORITY_TONE[o.priority as keyof typeof PRIORITY_TONE]}>
                        {PRIORITY_LABELS[o.priority as keyof typeof PRIORITY_LABELS]}
                      </Badge>
                    </Td>
                    <Td className="text-text-muted">{relativeTime(o.checked_in_at as string)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
