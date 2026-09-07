"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { can, ROLE_LABELS, type Capability } from "@/lib/permissions";
import { initials } from "@/lib/format";
import type { MembershipRole } from "@/types/domain";
import { NAV } from "./nav";
import { GarageSwitcher } from "./GarageSwitcher";
import { AppTour } from "@/components/tour/AppTour";

interface ShellGarage {
  id: string;
  name: string;
}

export function AppShell({
  children,
  role,
  userName,
  email,
  garage,
  garages,
  isPlatformAdmin,
  tourPending,
}: {
  children: React.ReactNode;
  role: MembershipRole;
  userName: string;
  email: string;
  garage: ShellGarage;
  garages: ShellGarage[];
  isPlatformAdmin: boolean;
  tourPending?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => setMobileOpen(false), [pathname]);

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.cap || can(role, i.cap as Capability)),
  })).filter((g) => g.items.length > 0);

  const nav = (
    <nav className="gf-scroll flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-text-subtle">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (!item.exact && pathname.startsWith(item.href + "/"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-tour={item.href}
                    className={cn(
                      "block rounded-[var(--radius)] px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-brand-soft font-medium text-brand"
                        : "text-text-muted hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            G
          </span>
          <span className="font-semibold text-text">GarageFlow</span>
        </div>
        <div className="border-b border-border px-3 py-3">
          <GarageSwitcher current={garage} garages={garages} />
        </div>
        {nav}
        <UserMenu userName={userName} email={email} role={role} isPlatformAdmin={isPlatformAdmin} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold text-text">GarageFlow</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="text-text-muted"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="border-b border-border px-3 py-3">
              <GarageSwitcher current={garage} garages={garages} />
            </div>
            {nav}
            <UserMenu
              userName={userName}
              email={email}
              role={role}
              isPlatformAdmin={isPlatformAdmin}
            />
          </aside>
        </div>
      ) : null}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-[var(--radius)] border border-border px-2.5 py-1.5 text-sm"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="truncate text-sm font-medium text-text">{garage.name}</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>

      <AppTour role={role} autoStart={Boolean(tourPending)} />
    </div>
  );
}

function UserMenu({
  userName,
  email,
  role,
  isPlatformAdmin,
}: {
  userName: string;
  email: string;
  role: MembershipRole;
  isPlatformAdmin: boolean;
}) {
  return (
    <div className="border-t border-border p-3" data-tour="user-menu">
      {isPlatformAdmin ? (
        <Link
          href="/admin"
          className="mb-2 block rounded-[var(--radius)] bg-surface-2 px-2 py-1.5 text-xs font-medium text-text-muted hover:text-text"
        >
          → Platform admin
        </Link>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
          {initials(userName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{userName}</p>
          <p className="truncate text-xs text-text-subtle">{ROLE_LABELS[role]}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("gf:start-tour"))}
        className="mt-2 w-full rounded-[var(--radius)] px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-2 hover:text-text"
      >
        Replay guided tour
      </button>
      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="w-full rounded-[var(--radius)] px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-2 hover:text-text"
        >
          Sign out ({email})
        </button>
      </form>
    </div>
  );
}
