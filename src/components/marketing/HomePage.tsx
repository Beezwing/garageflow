import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/primitives";

const CONTACT_EMAIL = "damaliebaker@outlook.com";
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "GarageFlow pilot",
)}`;

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Booking & the front desk",
    body: "A booking link customers use to request an appointment and upload photos of the vehicle. Confirm the time or propose another, then a guided check-in turns it into a job.",
  },
  {
    title: "The workshop floor",
    body: "A digital job card for every vehicle. Assign mechanics, track time, log the work, raise extra-work approvals, and sign off quality control before it goes back.",
  },
  {
    title: "Parts & stock",
    body: "A parts catalogue with cost and sale price. Using a part on a job deducts stock automatically, with low-stock alerts and a full movement history.",
  },
  {
    title: "Money",
    body: "The invoice builds itself from the job — parts, labour and services — with tax, discounts and part-payments handled, and a printable receipt.",
  },
  {
    title: "Your customers",
    body: "A portal your customers sign into from their phone, to track their repair, approve extra work, and see their invoices — no calls needed.",
  },
  {
    title: "Reports & staff",
    body: "Revenue, profitability, technician productivity and stock, for any date range. Roles for admin, supervisor, mechanic and front desk, each seeing only what they need.",
  },
];

export function HomePage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold text-brand">GarageFlow</span>
          <ButtonLink href="/login" variant="secondary" size="sm">
            Sign in
          </ButtonLink>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------- hero */}
        <section className="mx-auto max-w-5xl px-6 pt-14 pb-16 sm:pt-20">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
                Currently in private pilot
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-text sm:text-5xl">
                Run your whole garage from check-in to collection.
              </h1>
              <p className="mt-5 max-w-lg text-lg text-text-muted">
                Digital job cards, live invoicing, parts and stock, mechanic
                worksheets, and a portal your customers use from their phone
                &mdash; in one system, built for Caribbean workshops. GCT
                handled, JMD by default, works on a phone on the shop floor.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href={CONTACT_HREF} size="lg">
                  Get in touch about a pilot
                </ButtonLink>
                <ButtonLink href="/login" variant="secondary" size="lg">
                  Sign in
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-text-subtle">
                We&rsquo;re onboarding a small number of real garages right
                now. If that&rsquo;s you, say hello &mdash; we&rsquo;ll set
                you up.
              </p>
            </div>

            {/* illustrative job-card mock — not a screenshot */}
            <Card className="shadow-sm">
              <CardBody className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text">
                    JOB-2026-000148
                  </span>
                  <Badge tone="blue">In progress</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-text">Nissan Note &middot; 6621 HB</p>
                  <p className="text-text-muted">Everton Gordon</p>
                </div>
                <div className="rounded-[var(--radius)] bg-surface-2 p-3 text-sm text-text-muted">
                  A/C not cold, engine light on &mdash; diagnose &amp; repair
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Invoice</span>
                  <span className="font-medium text-text">
                    $22,770.00 &middot; unpaid
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Mechanic</span>
                  <Badge tone="green">Dwayne Brown</Badge>
                </div>
              </CardBody>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------------ features */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-2xl font-semibold text-text">
              Everything the job needs, in one place
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title}>
                  <CardBody>
                    <h3 className="text-sm font-semibold text-text">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-sm text-text-muted">{f.body}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- pilot */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <Card className="border-brand bg-brand-soft">
            <CardBody className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">
                  Want to try it in your workshop?
                </h2>
                <p className="mt-1 max-w-md text-sm text-text-muted">
                  GarageFlow is built and running today, ahead of a public
                  launch. A handful of real garages are piloting it now &mdash;
                  get in touch and we&rsquo;ll set your garage up.
                </p>
              </div>
              <ButtonLink href={CONTACT_HREF} size="lg" className="shrink-0">
                Get in touch
              </ButtonLink>
            </CardBody>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-sm text-text-subtle">
          <span>&copy; {new Date().getFullYear()} GarageFlow</span>
          <a href={CONTACT_HREF} className="hover:text-text-muted">
            {CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}
