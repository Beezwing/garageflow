import { hasSupabaseEnv } from "@/lib/supabase/config";
import { redirect } from "next/navigation";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  if (hasSupabaseEnv()) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-lg font-bold text-brand-fg">
        G
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-text">Finish setting up GarageFlow</h1>
      <p className="mt-2 text-sm text-text-muted">
        GarageFlow needs a Supabase project. This takes about five minutes.
      </p>

      <ol className="mt-6 space-y-4 text-sm text-text">
        <li>
          <strong>1. Create a Supabase project</strong> at{" "}
          <a className="text-brand hover:underline" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
            supabase.com/dashboard
          </a>
          .
        </li>
        <li>
          <strong>2. Run the migrations.</strong> In the project&apos;s <em>SQL Editor</em>, paste and
          run each file from <code className="rounded bg-surface-2 px-1">supabase/migrations</code> in
          order (0001 → 0007), then optionally <code className="rounded bg-surface-2 px-1">supabase/seed.sql</code>{" "}
          for demo data.
        </li>
        <li>
          <strong>3. Copy your API keys.</strong> Project Settings → API. Put them in{" "}
          <code className="rounded bg-surface-2 px-1">.env.local</code>:
          <pre className="mt-2 overflow-x-auto rounded-[var(--radius)] border border-border bg-surface p-3 text-xs">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000`}
          </pre>
        </li>
        <li>
          <strong>4. Restart the dev server</strong> (<code className="rounded bg-surface-2 px-1">npm run dev</code>) and refresh this page.
        </li>
      </ol>

      <p className="mt-6 text-xs text-text-subtle">
        Auth redirect URLs: add <code>http://localhost:3000/auth/callback</code> under Supabase →
        Authentication → URL Configuration.
      </p>
    </div>
  );
}
