"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that caches the app shell for offline use.
 * Production only; failures are ignored so the app never depends on it.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/provenance-v2/sw.js", { scope: "/provenance-v2/" })
      .catch(() => {});
  }, []);
  return null;
}
