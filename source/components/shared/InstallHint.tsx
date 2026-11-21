"use client";

import { useEffect, useState } from "react";

/**
 * "Add to Home Screen" hint. iOS Safari has no programmatic install prompt,
 * so on iPhones/iPads that aren't already running installed, show a small
 * dismissible banner explaining the Share -> Add to Home Screen flow.
 * Also requests persistent storage where supported (no-op on iOS).
 */
export default function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
      const ua = navigator.userAgent;
      const isiOS =
        /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        (window.navigator as { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      if (!isiOS || standalone) return;
      if (localStorage.getItem("provenance-install-dismissed")) return;
      setShow(true);
    } catch {
      // never block the app on a hint
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm leading-snug text-zinc-50 shadow-lg">
      <div>
        <strong>Install Provenance</strong>
        <br />
        In Safari, tap the Share button, then{" "}
        <strong>Add to Home Screen</strong>. It opens full-screen and keeps
        working offline.
      </div>
      <button
        className="ml-auto shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400"
        onClick={() => {
          try {
            localStorage.setItem("provenance-install-dismissed", "1");
          } catch {}
          setShow(false);
        }}
      >
        Not now
      </button>
    </div>
  );
}
