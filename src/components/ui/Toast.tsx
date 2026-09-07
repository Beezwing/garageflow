"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastCtx = React.createContext<{
  push: (message: string, tone?: ToastTone) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const push = React.useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => {
      // de-dupe identical messages already on screen (prevents effect-loop spam)
      if (t.some((x) => x.message === message && x.tone === tone)) return t;
      return [...t, { id, message, tone }];
    });
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-[var(--radius)] border px-4 py-3 text-sm shadow-lg",
              "border-border bg-surface text-text",
            )}
          >
            <span
              className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
              style={{
                background:
                  t.tone === "success"
                    ? "var(--tone-green-fg)"
                    : t.tone === "error"
                      ? "var(--tone-red-fg)"
                      : "var(--brand)",
              }}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
