"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setActiveGarage } from "@/lib/actions/garage";

export function GarageSwitcher({
  current,
  garages,
}: {
  current: { id: string; name: string };
  garages: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  if (garages.length <= 1) {
    return (
      <div className="rounded-[var(--radius)] bg-surface-2 px-2.5 py-2 text-sm font-medium text-text">
        {current.name}
      </div>
    );
  }

  return (
    <select
      value={current.id}
      disabled={pending}
      onChange={(e) => {
        const id = e.target.value;
        start(async () => {
          await setActiveGarage(id);
          router.push("/dashboard");
          router.refresh();
        });
      }}
      className="w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-2 text-sm font-medium text-text"
    >
      {garages.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
