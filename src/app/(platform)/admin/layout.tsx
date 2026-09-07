import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) redirect("/");

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-text text-sm font-bold text-bg">
              G
            </span>
            <span className="font-semibold text-text">GarageFlow · Platform</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-text-muted hover:text-text">
              Garages
            </Link>
            <Link href="/admin/plans" className="text-text-muted hover:text-text">
              Plans
            </Link>
            {ctx.memberships.length > 0 ? (
              <Link href="/dashboard" className="text-text-muted hover:text-text">
                My garage →
              </Link>
            ) : null}
            <form action="/auth/sign-out" method="post">
              <button className="text-text-muted hover:text-text">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
