"use client";

import * as React from "react";
import { subscribePush, unsubscribePush } from "@/lib/actions/push";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "checking" | "unsupported" | "ios-install" | "off" | "on" | "blocked";

/** "Turn on notifications for this device" card. Drop into any authenticated page. */
export function PushToggle() {
  const toast = useToast();
  const [status, setStatus] = React.useState<Status>("checking");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function check() {
      const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
      if (!supported) {
        setStatus("unsupported");
        return;
      }
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS && !isStandalone) {
        setStatus("ios-install");
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        setStatus("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setStatus(sub ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("off");
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("blocked");
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Push isn't set up yet.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await subscribePush({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      });
      if (!res.ok) throw new Error(res.error || "Couldn't save that.");
      setStatus("on");
      toast.push("Notifications on for this device", "success");
    } catch (e) {
      toast.push((e as Error).message || "Couldn't turn on notifications", "error");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      toast.push("Notifications off for this device", "success");
    } catch (e) {
      toast.push((e as Error).message || "Couldn't turn that off", "error");
    } finally {
      setPending(false);
    }
  }

  if (status === "checking" || status === "unsupported") return null;

  if (status === "ios-install") {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">
        <strong className="text-text">Get notified on this iPhone:</strong> tap the Share button, then
        &ldquo;Add to Home Screen&rdquo;. Notifications only work once it&rsquo;s installed.
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">
        Notifications are blocked for this site in your browser settings. Allow them there to turn this
        on.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-3">
      <div className="text-sm">
        <p className="font-medium text-text">
          {status === "on" ? "Notifications are on for this device" : "Get notified on this device"}
        </p>
        <p className="text-text-muted">
          {status === "on"
            ? "You'll be alerted here even when the tab is closed."
            : "New jobs, approvals and updates, right on your phone."}
        </p>
      </div>
      <Button
        size="sm"
        variant={status === "on" ? "secondary" : "primary"}
        disabled={pending}
        onClick={status === "on" ? disable : enable}
      >
        {pending ? "…" : status === "on" ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
