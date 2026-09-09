"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeStaffRole, removeStaff } from "@/lib/actions/staff";
import { ROLE_LABELS } from "@/lib/permissions";
import { Td } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export function StaffRow({
  id,
  name,
  avatar,
  role,
  isSelf,
  joined,
}: {
  id: string;
  name: string;
  avatar: string;
  role: keyof typeof ROLE_LABELS;
  isSelf: boolean;
  joined: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  return (
    <tr className="hover:bg-surface-2">
      <Td>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
            {avatar}
          </span>
          <span className="font-medium text-text">{name}</span>
          {isSelf ? <span className="text-xs text-text-subtle">(you)</span> : null}
        </div>
      </Td>
      <Td label="Role">
        <select
          defaultValue={role}
          disabled={pending}
          onChange={(e) => {
            const fd = new FormData();
            fd.set("membership_id", id);
            fd.set("role", e.target.value);
            start(async () => {
              try {
                await changeStaffRole(fd);
                toast.push("Role updated", "success");
                router.refresh();
              } catch (err) {
                toast.push((err as Error).message, "error");
                router.refresh();
              }
            });
          }}
          className="rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-sm"
        >
          {Object.entries(ROLE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Td>
      <Td label="Joined" className="text-text-muted">{joined}</Td>
      <Td label="" className="text-right max-sm:justify-end">
        {isSelf ? (
          <span className="text-xs text-text-subtle">—</span>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className="text-sm text-[var(--tone-red-fg)] hover:underline"
          >
            Remove
          </button>
        )}
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            const fd = new FormData();
            fd.set("membership_id", id);
            start(async () => {
              try {
                await removeStaff(fd);
                toast.push("Team member removed", "success");
              } catch (err) {
                toast.push((err as Error).message, "error");
              }
              setConfirm(false);
              router.refresh();
            });
          }}
          title="Remove team member"
          message={`Remove ${name} from this garage? They will lose access immediately.`}
          confirmLabel="Remove"
          destructive
          pending={pending}
        />
      </Td>
    </tr>
  );
}
