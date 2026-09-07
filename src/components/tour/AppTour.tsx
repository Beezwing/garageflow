"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import "driver.js/dist/driver.css";
import { createClient } from "@/lib/supabase/client";
import type { MembershipRole } from "@/types/domain";

type Step = { element?: string; title: string; description: string; wizardStep?: number };

/* ------------------------------------------------------------------ */
/* Tour definitions                                                    */
/* ------------------------------------------------------------------ */

function appTour(role: MembershipRole): Step[] {
  const intro: Step = {
    title: "Welcome to GarageFlow 👋",
    description: "A quick tour of where everything lives. Replay it any time from the menu under your name.",
  };
  if (role === "technician") {
    return [
      intro,
      { element: '[data-tour="/workshop/my-jobs"]', title: "My jobs", description: "Your assigned vehicles, your tasks, and a clock for each job." },
      { element: '[data-tour="/workshop/jobs"]', title: "All jobs", description: "Every work order in the garage if you need the full picture." },
      { element: '[data-tour="/notifications"]', title: "Notifications", description: "You'll be pinged here when you're assigned or additional work is approved." },
      { element: '[data-tour="user-menu"]', title: "Your account", description: "Switch garages, sign out, or replay this tour." },
    ];
  }
  return [
    intro,
    { element: '[data-tour="/dashboard"]', title: "Dashboard", description: "Your morning glance: what's in, what's waiting, revenue, who's working, and jobs ready for payment." },
    { element: '[data-tour="/workshop/check-in"]', title: "Vehicle check-in", description: "Start here when a car arrives. It opens the job and the invoice in one flow." },
    { element: '[data-tour="/workshop/jobs"]', title: "Jobs", description: "Every work order. Open one to assign technicians, add charges, handle approvals and quality control." },
    { element: '[data-tour="/customers"]', title: "Customers & vehicles", description: "Full history for every customer and vehicle — search by name, plate, VIN or engine number." },
    { element: '[data-tour="/inventory/parts"]', title: "Inventory", description: "Parts and suppliers. Using a part on a job deducts it here automatically." },
    { element: '[data-tour="/billing/invoices"]', title: "Billing", description: "Invoices build live from each job. Record cash, card or transfer payments." },
    { element: '[data-tour="/reports"]', title: "Reports", description: "Revenue, profit, technician productivity, inventory — exportable to PDF or CSV." },
    { element: '[data-tour="/settings/services"]', title: "Services & pricing", description: "Preset prices for common jobs. Staff can always override them." },
    { element: '[data-tour="user-menu"]', title: "That's the map", description: "Now check a vehicle in →" },
  ];
}

const checkinTour: Step[] = [
  {
    element: '[data-tour="checkin-steps"]',
    title: "Checking a vehicle in",
    description: "Seven steps, shown here. This tour walks the card through each one — use Next / Back.",
  },
  {
    element: '[data-tour="checkin-body"]',
    wizardStep: 0,
    title: "Step 1 · Customer",
    description: "Search for an existing customer, or switch to “New customer”. One person can own several vehicles.",
  },
  {
    element: '[data-tour="checkin-body"]',
    wizardStep: 1,
    title: "Step 2 · Vehicle",
    description: "Pick one of the customer's vehicles, or add a new one. Plate and VIN are checked so you don't create duplicates.",
  },
  {
    element: '[data-tour="checkin-body"]',
    wizardStep: 2,
    title: "Step 3 · Job details + estimate",
    description: "Complaint, priority, mileage, fuel — then “Planned work & estimate”. What you list here opens the invoice; anything added later joins it automatically.",
  },
  {
    element: '[data-tour="checkin-body"]',
    wizardStep: 3,
    title: "Step 4 · Condition",
    description: "Run the inspection checklist and tap the car diagram to mark any existing damage before work starts.",
  },
  {
    element: '[data-tour="checkin-body"]',
    wizardStep: 4,
    title: "Step 5 · Photos",
    description: "Take or upload before-photos by category. This protects both the garage and the customer.",
  },
  {
    element: '[data-tour="checkin-body"]',
    wizardStep: 5,
    title: "Step 6 · Sign-off",
    description: "Optional customer and staff signatures on the recorded condition.",
  },
  {
    element: '[data-tour="checkin-body"]',
    wizardStep: 6,
    title: "Step 7 · Review & check in",
    description: "Confirm the summary, then Check in vehicle. You land on the job card, ready to assign a technician.",
  },
];

const paymentTour: Step[] = [
  { title: "Taking a payment", description: "This invoice built itself from the job's parts, labour and services." },
  { element: '[data-tour="invoice-items"]', title: "Line items", description: "Lines marked \"from job\" are read-only — edit the work order to change them. Add one-off charges or a discount below." },
  { element: '[data-tour="invoice-summary"]', title: "Totals", description: "Subtotal, tax and the balance due update as lines and payments change." },
  { element: '[data-tour="invoice-payment"]', title: "Record a payment", description: "Amount, method and a reference. Partial payments are fine — the invoice flips to Paid when the balance hits zero." },
  { element: '[data-tour="invoice-actions"]', title: "Then release", description: "Once it's paid, checkout on the work order unblocks. Print / PDF gives the customer a copy." },
];

const TOURS: Record<string, (role: MembershipRole) => Step[]> = {
  app: appTour,
  checkin: () => checkinTour,
  payment: () => paymentTour,
};

/* ------------------------------------------------------------------ */

function seen(name: string): boolean {
  try {
    return localStorage.getItem(`gf-tour-${name}`) === "1";
  } catch {
    return true;
  }
}
function markSeen(name: string) {
  try {
    localStorage.setItem(`gf-tour-${name}`, "1");
  } catch {
    /* ignore */
  }
}

export function AppTour({ role, autoStart }: { role: MembershipRole; autoStart: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const appStarted = React.useRef(false);

  const run = React.useCallback(
    async (name: string) => {
      const { driver } = await import("driver.js");
      const all = (TOURS[name] ?? TOURS.app)(role);

      // wizard-driven tours (check-in): keep every step, navigate the wizard as
      // the tour moves. Others: drop steps whose anchor isn't on the page.
      const wizardDriven = all.some((s) => s.wizardStep != null);
      const usable = wizardDriven ? all : all.filter((s) => !s.element || document.querySelector(s.element));
      if (usable.length === 0) return;

      const goto = (n?: number) => {
        if (n == null) return;
        window.dispatchEvent(new CustomEvent("gf:checkin-step", { detail: n }));
      };

      const steps = usable.map((s) => ({
        element: s.element,
        popover: { title: s.title, description: s.description },
        onHighlightStarted: () => goto(s.wizardStep),
      }));

      const d = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: true,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        steps,
        onDestroyed: () => {
          markSeen(name);
          if (name === "app") {
            try {
              void createClient().rpc("complete_tour");
            } catch {
              /* ignore */
            }
          }
        },
      });
      d.drive();
    },
    [role],
  );

  // app overview — auto start once on the landing page
  React.useEffect(() => {
    if (!autoStart || appStarted.current) return;
    const onLanding =
      (role === "technician" && pathname === "/workshop/my-jobs") ||
      (role !== "technician" && pathname === "/dashboard");
    if (!onLanding) return;
    appStarted.current = true;
    const t = setTimeout(() => run("app"), 700);
    return () => clearTimeout(t);
  }, [autoStart, pathname, role, run]);

  // feature tours — auto start once each, when the user first lands on the page
  React.useEffect(() => {
    let name: string | null = null;
    if (pathname === "/workshop/check-in") name = "checkin";
    else if (/^\/billing\/invoices\/[^/]+$/.test(pathname)) name = "payment";
    if (!name || seen(name)) return;
    const t = setTimeout(() => run(name!), 900);
    return () => clearTimeout(t);
  }, [pathname, run]);

  // manual triggers
  React.useEffect(() => {
    const handlers: Record<string, () => void> = {
      "gf:start-tour": () => {
        const target = role === "technician" ? "/workshop/my-jobs" : "/dashboard";
        if (pathname !== target) {
          router.push(target);
          setTimeout(() => run("app"), 900);
        } else run("app");
      },
      "gf:start-tour:checkin": () => run("checkin"),
      "gf:start-tour:payment": () => run("payment"),
    };
    Object.entries(handlers).forEach(([e, h]) => window.addEventListener(e, h));
    return () => Object.entries(handlers).forEach(([e, h]) => window.removeEventListener(e, h));
  }, [pathname, role, router, run]);

  return null;
}

/** Small "?" button pages can drop in to start their feature tour. */
export function TourButton({ tour, label = "Show me around" }: { tour: "checkin" | "payment"; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(`gf:start-tour:${tour}`))}
      className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
    >
      {label}
    </button>
  );
}
