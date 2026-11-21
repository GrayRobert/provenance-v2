"use client";

import { useEffect, useState } from "react";

type InstallHintKind = "ios" | "android";

export default function InstallHint() {
  const [kind, setKind] = useState<InstallHintKind | null>(null);

  useEffect(() => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }

      const ua = navigator.userAgent;
      const isIOS =
        /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/i.test(ua);
      const standalone =
        (window.navigator as Navigator & { standalone?: boolean }).standalone ===
          true || window.matchMedia("(display-mode: standalone)").matches;

      if (standalone || (!isIOS && !isAndroid)) return;
      if (localStorage.getItem("provenance-install-dismissed")) return;
      setKind(isIOS ? "ios" : "android");
    } catch {
      // Never block the app on an install hint.
    }
  }, []);

  if (!kind) return null;

  const steps =
    kind === "ios"
      ? "Tap your browser's Share button, then choose Add to Home Screen."
      : "Open your browser's menu, then choose Install app or Add to Home screen.";

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm leading-snug text-zinc-50 shadow-lg">
      <div>
        <strong>Install Provenance</strong>
        <br />
        {steps} It opens full-screen and keeps working offline.
      </div>
      <button
        className="ml-auto shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400"
        onClick={() => {
          try {
            localStorage.setItem("provenance-install-dismissed", "1");
          } catch {}
          setKind(null);
        }}
      >
        Not now
      </button>
    </div>
  );
}
