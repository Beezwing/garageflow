import Link from "next/link";
import { getPortalContext } from "@/lib/portal";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPortalContext();
  const garageName = ctx?.customers[0]?.garage?.name;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={ctx ? "/portal" : "/portal/login"} className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
              G
            </span>
            <span className="text-sm font-semibold text-text">{garageName ?? "GarageFlow"}</span>
          </Link>
          {ctx && ctx.customers.length > 0 ? (
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/portal" className="text-text-muted hover:text-text">
                Vehicles
              </Link>
              <Link href="/portal/appointments" className="text-text-muted hover:text-text">
                Appointments
              </Link>
              <Link href="/portal/invoices" className="text-text-muted hover:text-text">
                Invoices
              </Link>
              <form action="/auth/sign-out" method="post">
                <button className="text-text-muted hover:text-text">Sign out</button>
              </form>
            </nav>
          ) : ctx ? (
            <form action="/auth/sign-out" method="post">
              <button className="text-sm text-text-muted hover:text-text">Sign out</button>
            </form>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
