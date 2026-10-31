'use client';

import { useEffect, useState } from 'react';

const ROTATION_MS = 3000;

const MESSAGES = [
  'Working on it',
  'Scaffolding your song',
  'Nearly there',
] as const;

function AnimatedEllipsis() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setPhase((p) => (p + 1) % 3), 450);
    return () => window.clearInterval(id);
  }, []);
  const dots = '.'.repeat(phase + 1);
  return (
    <span className="inline-block min-w-[1.25em] text-left" aria-hidden>
      {dots}
    </span>
  );
}

export interface SongScaffoldProgressOverlayProps {
  open: boolean;
}

/**
 * Full-screen overlay while a new song is created and scaffold sections are applied.
 * Rotates status copy every few seconds; indeterminate bar is decorative only.
 */
export function SongScaffoldProgressOverlay({ open }: SongScaffoldProgressOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  const label = MESSAGES[messageIndex];
  const isNearlyThere = messageIndex === MESSAGES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[210] flex flex-col items-center justify-center gap-8 bg-background/95 px-6 text-center backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="scaffold-progress-title"
    >
      <div className="max-w-sm space-y-3">
        <h2 id="scaffold-progress-title" className="text-lg font-semibold text-foreground sm:text-xl">
          {isNearlyThere ? (
            <>
              {label}
              <AnimatedEllipsis />
            </>
          ) : (
            label
          )}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Building your sections—this can take a few seconds.
        </p>
      </div>

      <div className="w-full max-w-xs" aria-hidden>
        <svg
          className="h-2 w-full"
          viewBox="0 0 320 8"
          preserveAspectRatio="none"
          role="presentation"
        >
          <rect width="320" height="8" fill="currentColor" rx="4" className="text-border" />
          <rect width="96" height="8" fill="currentColor" rx="4" className="text-accent">
            <animate
              attributeName="x"
              values="-96;224;224"
              keyTimes="0;0.85;1"
              dur="1.35s"
              repeatCount="indefinite"
            />
          </rect>
        </svg>
      </div>
    </div>
  );
}
