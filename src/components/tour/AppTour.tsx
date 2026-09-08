"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import "driver.js/dist/driver.css";
import { createClient } from "@/lib/supabase/client";
import type { MembershipRole } from "@/types/domain";
import { APP_OVERVIEW, ROUTE_TOURS, tourForPath, type TourDef } from "./tours";

/* ---- per-tour state in localStorage ---------------------------------- */
const seenKey = (k: string) => `gf-tour-seen-${k}`;
const offKey = (k: string) => `gf-tour-off-${k}`;

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const write = (key: string, on: boolean) => {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

const seen = (k: string) => read(seenKey(k));
const dismissed = (k: string) => read(offKey(k));

/* ------------------------------------------------------------------ */

export function AppTour({ role, autoStart }: { role: MembershipRole; autoStart: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const running = React.useRef(false);
  const appHandled = React.useRef(false);

  const run = React.useCallback(
    async (def: TourDef, opts: { force?: boolean } = {}) => {
      if (running.current) return;
      const { driver } = await import("driver.js");
      const all = def.steps(role);

      const usable = def.wizardDriven
        ? all
        : all.filter((s) => !s.element || document.querySelector(s.element));
      if (usable.length === 0) return;

      let turnOff = dismissed(def.key);

      const steps = usable.map((s) => ({
        element: s.element,
        popover: { title: s.title, description: s.description },
        onHighlightStarted: () => {
          if (s.wizardStep != null) {
            window.dispatchEvent(new CustomEvent("gf:checkin-step", { detail: s.wizardStep }));
          }
        },
      }));

      running.current = true;
      const d = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: true,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        steps,
        onPopoverRender: (popover) => {
          if (popover.footer.querySelector("[data-gf-dsa]")) return;
          popover.footer.style.flexWrap = "wrap";
          popover.footer.style.rowGap = "8px";
          const label = document.createElement("label");
          label.setAttribute("data-gf-dsa", "");
          label.style.cssText =
            "flex-basis:100%;order:-1;display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;cursor:pointer;user-select:none";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = turnOff;
          cb.style.cssText = "width:14px;height:14px;cursor:pointer;margin:0";
          cb.addEventListener("change", () => {
            turnOff = cb.checked;
          });
          label.appendChild(cb);
          label.appendChild(document.createTextNode("Don’t show this tour again"));
          popover.footer.insertBefore(label, popover.footer.firstChild);
        },
        onDestroyed: () => {
          running.current = false;
          write(seenKey(def.key), true);
          write(offKey(def.key), turnOff);
          if (def.key === "app") {
            try {
              void createClient().rpc("complete_tour");
            } catch {
              /* ignore */
            }
          }
        },
      });
      void opts;
      d.drive();
    },
    [role],
  );

  /* app overview — once per user, on the landing page */
  React.useEffect(() => {
    if (!autoStart || appHandled.current) return;
    if (!APP_OVERVIEW.match(pathname, role)) return;
    if (seen("app") || dismissed("app")) {
      appHandled.current = true;
      return;
    }
    appHandled.current = true;
    const t = setTimeout(() => run(APP_OVERVIEW), 700);
    return () => clearTimeout(t);
  }, [autoStart, pathname, role, run]);

  /* per-page tours — auto-run once each, unless dismissed */
  React.useEffect(() => {
    const def = tourForPath(pathname, role);
    if (!def) return;
    if (seen(def.key) || dismissed(def.key)) return;
    // don't collide with the app overview on the landing page
    if (APP_OVERVIEW.match(pathname, role) && !seen("app") && !dismissed("app")) return;
    if (def.autoRoles && !def.autoRoles.includes(role)) return;
    const t = setTimeout(() => run(def), 900);
    return () => clearTimeout(t);
  }, [pathname, role, run]);

  /* manual triggers */
  React.useEffect(() => {
    const replayHere = () => {
      const def = tourForPath(pathname, role);
      if (def) {
        run(def, { force: true });
        return;
      }
      // no page tour here → run the app overview (navigating home if needed)
      const target = role === "technician" ? "/workshop/my-jobs" : "/dashboard";
      if (pathname !== target) {
        router.push(target);
        setTimeout(() => run(APP_OVERVIEW, { force: true }), 900);
      } else {
        run(APP_OVERVIEW, { force: true });
      }
    };

    const byKey = (e: Event) => {
      const key = (e as CustomEvent).detail as string;
      const def = key === "app" ? APP_OVERVIEW : ROUTE_TOURS.find((t) => t.key === key);
      if (def) run(def, { force: true });
    };

    window.addEventListener("gf:start-tour", replayHere);
    window.addEventListener("gf:start-tour:key", byKey as EventListener);
    return () => {
      window.removeEventListener("gf:start-tour", replayHere);
      window.removeEventListener("gf:start-tour:key", byKey as EventListener);
    };
  }, [pathname, role, router, run]);

  return null;
}

/** Small "Show me around" button pages can drop in to start their tour. */
export function TourButton({ tour, label = "Show me around" }: { tour: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("gf:start-tour:key", { detail: tour }))}
      className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
    >
      {label}
    </button>
  );
}
