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
import { GlobalSearch } from "./GlobalSearch";
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
  unreadCount = 0,
}: {
  children: React.ReactNode;
  role: MembershipRole;
  userName: string;
  email: string;
  garage: ShellGarage;
  garages: ShellGarage[];
  isPlatformAdmin: boolean;
  tourPending?: boolean;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => setMobileOpen(false), [pathname]);

  const homeHref = can(role, "reports.view") ? "/dashboard" : "/workshop/my-jobs";
  const bottomNav: { href: string; label: string; icon: React.ReactNode; show: boolean }[] = [
    { href: homeHref, label: "Home", icon: <IconHome />, show: true },
    { href: "/workshop/jobs", label: "Jobs", icon: <IconWrench />, show: true },
    {
      href: "/workshop/check-in",
      label: "Check in",
      icon: <IconPlus />,
      show: can(role, "vehicle.checkin"),
    },
    { href: "/notifications", label: "Alerts", icon: <IconBell />, show: true },
  ].filter((i) => i.show);

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
                      "flex items-center justify-between rounded-[var(--radius)] px-2 py-2 text-sm transition-colors max-lg:py-2.5",
                      active
                        ? "bg-brand-soft font-medium text-brand"
                        : "text-text-muted hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    <span>{item.label}</span>
                    {item.href === "/notifications" && unreadCount > 0 ? (
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[0.65rem] font-semibold text-brand-fg">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
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
        <div className="space-y-2 border-b border-border px-3 py-3">
          <GarageSwitcher current={garage} garages={garages} />
          <GlobalSearch />
        </div>
        {nav}
        <UserMenu userName={userName} email={email} role={role} isPlatformAdmin={isPlatformAdmin} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="pt-safe pb-safe relative flex h-full w-[82vw] max-w-xs flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold text-text">GarageFlow</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-[var(--radius)] text-text-muted hover:bg-surface-2"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 border-b border-border px-3 py-3">
              <GarageSwitcher current={garage} garages={garages} />
              <GlobalSearch />
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
        <header className="pt-safe sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface/90 px-3 py-2.5 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] border border-border text-lg"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            {garage.name.charAt(0)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{garage.name}</span>
          <div className="shrink-0">
            <GlobalSearch iconOnly />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        {bottomNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem] font-medium",
                active ? "text-brand" : "text-text-muted",
              )}
            >
              <span className="grid h-6 w-6 place-items-center">{item.icon}</span>
              {item.label}
              {item.href === "/notifications" && unreadCount > 0 ? (
                <span className="absolute right-[22%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[0.6rem] font-semibold text-brand-fg">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem] font-medium text-text-muted"
          aria-label="More"
        >
          <span className="grid h-6 w-6 place-items-center"><IconMenu /></span>
          More
        </button>
      </nav>

      <AppTour role={role} autoStart={Boolean(tourPending)} />
    </div>
  );
}

/* ---- bottom-nav icons (stroke, inherit color) ---- */
const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function IconHome() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function IconWrench() {
  return (
    <svg {...iconProps}>
      <path d="M14.5 6a3.5 3.5 0 0 0-4.9 4.4L3 17v4h4l6.6-6.6A3.5 3.5 0 0 0 18 9.5l-2.5 2.5-2-2L16 7.5A3.5 3.5 0 0 0 14.5 6Z" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg {...iconProps}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
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
        Replay this page&apos;s tour
      </button>
      <button
        type="button"
        onClick={() => {
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith("gf-tour-"))
              .forEach((k) => localStorage.removeItem(k));
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new Event("gf:start-tour"));
        }}
        className="w-full rounded-[var(--radius)] px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-2 hover:text-text"
      >
        Reset all tour hints
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
