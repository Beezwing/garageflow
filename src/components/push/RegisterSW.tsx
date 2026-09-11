"use client";

import * as React from "react";

/** Registers the service worker site-wide. Silent no-op if unsupported. */
export function RegisterSW() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* push/installability just won't be available */
      });
    }
  }, []);
  return null;
}
