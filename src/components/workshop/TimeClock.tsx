"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { startWork, stopWork } from "@/lib/actions/time";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { duration } from "@/lib/format";

export function TimeClock({
  workOrderId,
  runningSince,
  runningElsewhere,
  totalSeconds,
}: {
  workOrderId: string;
  runningSince: string | null;
  runningElsewhere: string | null; // number of another WO the clock is on
  totalSeconds: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (!runningSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningSince]);

  const live = runningSince
    ? totalSeconds + Math.floor((now - new Date(runningSince).getTime()) / 1000)
    : totalSeconds;

  async function go(fn: () => Promise<void>, msg: string) {
    setPending(true);
    try {
      await fn();
      toast.push(msg, "success");
      router.refresh();
    } catch (e) {
      toast.push((e as Error).message, "error");
    }
    setPending(false);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="tabular-nums">
        <span className="text-lg font-semibold text-text">{duration(live)}</span>
        <span className="ml-1 text-xs text-text-subtle">your time</span>
      </div>
      {runningSince ? (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => go(() => stopWork(workOrderId), "Clocked out")}>
          Stop work
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => go(() => startWork(workOrderId), "Clocked in")}
        >
          {runningElsewhere ? `Switch from ${runningElsewhere}` : "Start work"}
        </Button>
      )}
    </div>
  );
}
