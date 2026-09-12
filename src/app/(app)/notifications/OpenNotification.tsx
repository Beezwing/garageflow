"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Makes a notification row clickable: marks it read (fire-and-forget) and
 * takes you straight to what it's about. Falls back to a plain, non-clickable
 * div when there's nowhere sensible to send you (`href` is null).
 */
export function OpenNotification({
  id,
  href,
  read,
  children,
}: {
  id: string;
  href: string | null;
  read: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  if (!href) return <div>{children}</div>;

  function open() {
    if (!read) {
      void createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    }
    router.push(href as string);
  }

  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()} className="cursor-pointer">
      {children}
    </div>
  );
}
