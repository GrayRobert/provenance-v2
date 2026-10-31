'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GRACE_PERIOD_DAYS } from '@/lib/usePluginAccess';

const MESSAGE = `You have ${GRACE_PERIOD_DAYS} days to experience premium features on the free plan (plugins, song limits, and storage). If you wish to continue after that, please consider supporting Provenance with a paid plan.`;

export interface PluginGraceModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional plugin name for title (e.g. "Chord Explorer"). */
  pluginName?: string;
  /** Days left in the account grace period; shown beside Continue when set. */
  graceDaysRemaining?: number | null;
}

export function PluginGraceModal({
  open,
  onClose,
  pluginName,
  graceDaysRemaining,
}: PluginGraceModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, onClose]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plugin-grace-title"
      aria-describedby="plugin-grace-desc"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h2
          id="plugin-grace-title"
          className="text-lg font-semibold text-foreground"
        >
          {pluginName ? `${pluginName} – Free trial` : 'Free trial'}
        </h2>
        <p
          id="plugin-grace-desc"
          className="mt-3 text-sm leading-relaxed text-muted-foreground"
        >
          {MESSAGE}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {graceDaysRemaining != null && graceDaysRemaining > 0 && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              <span className="font-medium text-foreground tabular-nums">{graceDaysRemaining}</span>
              {graceDaysRemaining === 1 ? ' day' : ' days'} left in your trial
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : null;
}
