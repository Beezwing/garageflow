"use client";

import { Button } from "@/components/ui/Button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} size="sm">
      Print / Save as PDF
    </Button>
  );
}
