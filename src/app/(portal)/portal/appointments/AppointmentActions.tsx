"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { respondToAppointment } from "@/lib/actions/portal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function AppointmentActions({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState<"accept" | "decline" | null>(null);

  async function respond(decision: "accept" | "decline") {
    setPending(decision);
    try {
      await respondToAppointment(id, decision);
      toast.push(decision === "accept" ? "Appointment confirmed" : "Appointment declined", "success");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
      setPending(null);
    }
  }

  return (
    <div className="flex gap-2 pt-1">
      <Button size="sm" disabled={!!pending} onClick={() => respond("accept")}>
        {pending === "accept" ? "…" : "Accept this time"}
      </Button>
      <Button size="sm" variant="secondary" disabled={!!pending} onClick={() => respond("decline")}>
        {pending === "decline" ? "…" : "Decline"}
      </Button>
    </div>
  );
}
