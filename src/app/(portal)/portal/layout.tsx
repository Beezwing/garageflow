import Link from "next/link";
import { getPortalContext } from "@/lib/portal";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPortalContext();
  const garageName = ctx?.customers[0]?.garage?.name;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="pt-safe sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
          <Link href={ctx ? "/portal" : "/portal/login"} className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
              {(garageName ?? "G").charAt(0)}
            </span>
            <span className="text-sm font-semibold text-text">{garageName ?? "GarageFlow"}</span>
          </Link>
          {ctx && ctx.customers.length > 0 ? (
            <nav className="flex items-center gap-3 text-sm sm:gap-4">
              <Link href="/portal" className="py-1 text-text-muted hover:text-text">
                Vehicles
              </Link>
              <Link href="/portal/appointments" className="py-1 text-text-muted hover:text-text">
                Appointments
              </Link>
              <Link href="/portal/invoices" className="py-1 text-text-muted hover:text-text">
                Invoices
              </Link>
              <form action="/auth/sign-out" method="post">
                <button className="py-1 text-text-muted hover:text-text">Sign out</button>
              </form>
            </nav>
          ) : ctx ? (
            <form action="/auth/sign-out" method="post">
              <button className="py-1 text-sm text-text-muted hover:text-text">Sign out</button>
            </form>
          ) : null}
        </div>
      </header>
      <main className="pb-safe mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
