import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/primitives";
import { BookingForm } from "./BookingForm";

export const metadata = { title: "Request an appointment" };

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: garages } = await supabase.rpc("booking_garage", { p_slug: slug });
  const garage = (garages as { id: string; name: string; phone: string | null; address: string | null }[] | null)?.[0];
  if (!garage) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            {garage.name.charAt(0)}
          </span>
          <div>
            <p className="text-sm font-semibold text-text">{garage.name}</p>
            {garage.phone ? <p className="text-xs text-text-subtle">{garage.phone}</p> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-semibold text-text">Request a repair appointment</h1>
        <p className="mt-1 text-sm text-text-muted">
          Tell {garage.name} what your vehicle needs and when suits you. They&apos;ll confirm the time or
          suggest another — you&apos;ll see their answer in your account.
        </p>

        <div className="mt-5">
          <BookingForm
            garageId={garage.id}
            garageName={garage.name}
            slug={slug}
            signedIn={!!user}
            defaultName={(user?.user_metadata?.full_name as string) ?? ""}
            defaultEmail={user?.email ?? ""}
          />
        </div>

        <Card className="mt-6">
          <CardBody className="text-xs text-text-subtle">
            Already sent a request?{" "}
            <Link href="/portal/appointments" className="text-brand hover:underline">
              Check its status
            </Link>
            .
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
