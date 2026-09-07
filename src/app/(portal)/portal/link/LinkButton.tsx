"use client";

import * as React from "react";
import { claimPortalAccess } from "@/lib/actions/portal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function LinkButton() {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const { linked } = await claimPortalAccess();
          if (linked === 0) {
            toast.push("No matching customer record found yet.", "error");
            setPending(false);
          }
          // on success the action redirects to /portal
        } catch (e) {
          toast.push((e as Error).message, "error");
          setPending(false);
        }
      }}
    >
      {pending ? "Checking…" : "Connect my account"}
    </Button>
  );
}
