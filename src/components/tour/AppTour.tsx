"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import "driver.js/dist/driver.css";
import { createClient } from "@/lib/supabase/client";
import type { MembershipRole } from "@/types/domain";

type Step = {
  element?: string;
  title: string;
  description: string;
};

function stepsForRole(role: MembershipRole): Step[] {
  const common: Step[] = [
    {
      title: "Welcome to GarageFlow 👋",
      description:
        "A 60-second tour of where everything lives. You can replay it any time from the menu under your name.",
    },
  ];

  if (role === "technician") {
    return [
      ...common,
      {
        element: '[data-tour="/workshop/my-jobs"]',
        title: "My jobs",
        description: "Every vehicle assigned to you, with your tasks and a clock for each job.",
      },
      {
        element: '[data-tour="/workshop/jobs"]',
        title: "All jobs",
        description: "Browse every work order in the garage if you need the full picture.",
      },
      {
        element: '[data-tour="/notifications"]',
        title: "Notifications",
        description: "You'll be pinged here when you're assigned to a job or additional work is approved.",
      },
      {
        element: '[data-tour="user-menu"]',
        title: "Your account",
        description: "Switch garages, sign out, or replay this tour from here.",
      },
    ];
  }

  return [
    ...common,
    {
      element: '[data-tour="/dashboard"]',
      title: "Dashboard",
      description:
        "Your morning glance: what's in the garage, what's waiting, today's revenue and who's working.",
    },
    {
      element: '[data-tour="/workshop/check-in"]',
      title: "Vehicle check-in",
      description:
        "Start here whenever a car arrives. It walks you through customer, vehicle, condition, photos and sign-off, then opens a numbered job card.",
    },
    {
      element: '[data-tour="/workshop/jobs"]',
      title: "Jobs",
      description:
        "Every work order, filterable by status and priority. Open one to assign technicians, add parts and labour, handle approvals and run quality control.",
    },
    {
      element: '[data-tour="/customers"]',
      title: "Customers & vehicles",
      description:
        "Full history for every customer and vehicle — search by name, plate, VIN or engine number.",
    },
    {
      element: '[data-tour="/technicians"]',
      title: "Technicians",
      description: "Who's free, who's busy, hours logged this week and current workload.",
    },
    {
      element: '[data-tour="/inventory/parts"]',
      title: "Inventory",
      description:
        "Parts, stock levels and suppliers. Using a part on a job deducts it here automatically.",
    },
    {
      element: '[data-tour="/billing/invoices"]',
      title: "Billing",
      description:
        "Invoices build from a job's parts, labour and services. Record cash, card or transfer payments — partial payments are fine.",
    },
    {
      element: '[data-tour="/reports"]',
      title: "Reports",
      description: "Revenue, profitability, technician productivity, inventory and customer reports.",
    },
    {
      element: '[data-tour="/settings/services"]',
      title: "Services & pricing",
      description: "Set preset prices for common jobs. Staff can always override them on a work order.",
    },
    {
      element: '[data-tour="/settings"]',
      title: "Settings & staff",
      description: "Business details, tax, checklists, and inviting your team with the right roles.",
    },
    {
      element: '[data-tour="user-menu"]',
      title: "That's the map",
      description: "Switch garages or replay this tour any time from here. Now check a vehicle in →",
    },
  ];
}

export function AppTour({
  role,
  autoStart,
}: {
  role: MembershipRole;
  autoStart: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const startedRef = React.useRef(false);

  const run = React.useCallback(async () => {
    const { driver } = await import("driver.js");

    const all = stepsForRole(role);
    const steps = all
      .filter((s) => !s.element || document.querySelector(s.element))
      .map((s) => ({
        element: s.element,
        popover: { title: s.title, description: s.description },
      }));

    const d = driver({
      showProgress: true,
      allowClose: true,
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Got it",
      steps,
      onDestroyed: () => {
        try {
          void createClient().rpc("complete_tour");
        } catch {
          /* ignore */
        }
      },
    });
    d.drive();
  }, [role]);

  // auto-start once, only on the user's landing page
  React.useEffect(() => {
    if (!autoStart || startedRef.current) return;
    const onLanding =
      (role === "technician" && pathname === "/workshop/my-jobs") ||
      (role !== "technician" && pathname === "/dashboard");
    if (!onLanding) return;
    startedRef.current = true;
    const t = setTimeout(run, 700);
    return () => clearTimeout(t);
  }, [autoStart, pathname, role, run]);

  // manual replay from the user menu
  React.useEffect(() => {
    const handler = () => {
      const target = role === "technician" ? "/workshop/my-jobs" : "/dashboard";
      if (pathname !== target) {
        router.push(target);
        setTimeout(run, 900);
      } else {
        run();
      }
    };
    window.addEventListener("gf:start-tour", handler);
    return () => window.removeEventListener("gf:start-tour", handler);
  }, [pathname, role, router, run]);

  return null;
}
