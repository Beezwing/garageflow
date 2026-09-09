import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { shortDate, initials } from "@/lib/format";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  EmptyState,
  TableWrap,
  Table,
  Th,
  Td,
} from "@/components/ui/primitives";
import { InviteForm } from "./InviteForm";
import { StaffRow } from "./StaffRow";
import { revokeInvitation } from "@/lib/actions/staff";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "staff.manage")) redirect("/settings");

  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, status, user_id, created_at")
      .eq("garage_id", ctx.garage.id)
      .order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .eq("garage_id", ctx.garage.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  // profiles has no direct FK from memberships (both reference auth.users), so
  // PostgREST can't embed it — fetch names separately and join in memory.
  const memberIds = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name, phone").in("id", memberIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const profileById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p]),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team ({members?.length ?? 0})</CardTitle>
        </CardHeader>
        <TableWrap cards className="rounded-none border-0">
          <Table className="gf-table-cards">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => {
                const p = profileById.get(m.user_id as string) ?? null;
                return (
                  <StaffRow
                    key={m.id as string}
                    id={m.id as string}
                    name={p?.full_name || "—"}
                    avatar={initials(p?.full_name)}
                    role={m.role as keyof typeof ROLE_LABELS}
                    isSelf={m.user_id === ctx.userId}
                    joined={shortDate(m.created_at as string)}
                  />
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite a team member</CardTitle>
        </CardHeader>
        <CardBody>
          <InviteForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
        </CardHeader>
        {(invites ?? []).length === 0 ? (
          <CardBody>
            <EmptyState title="No pending invitations" />
          </CardBody>
        ) : (
          <TableWrap cards className="rounded-none border-0">
            <Table className="gf-table-cards">
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Expires</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {(invites ?? []).map((i) => (
                  <tr key={i.id as string}>
                    <Td>{i.email as string}</Td>
                    <Td label="Role">
                      <Badge tone="blue">{ROLE_LABELS[i.role as keyof typeof ROLE_LABELS]}</Badge>
                    </Td>
                    <Td label="Expires" className="text-text-muted">{shortDate(i.expires_at as string)}</Td>
                    <Td label="" className="text-right max-sm:justify-end">
                      <form action={revokeInvitation}>
                        <input type="hidden" name="invitation_id" value={i.id as string} />
                        <button className="text-sm text-[var(--tone-red-fg)] hover:underline">
                          Revoke
                        </button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
