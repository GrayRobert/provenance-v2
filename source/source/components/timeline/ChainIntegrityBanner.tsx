'use client';

import { Check, AlertTriangle } from 'lucide-react';
import HelpText from '@/components/shared/HelpText';

interface ChainIntegrityBannerProps {
  /** Chain verification result. Validate is triggered from the timeline bottom bar. */
  verified: boolean | null;
  /** 0-based index of the event that broke the chain (when verified is false). */
  violationEventIndex?: number;
  /** Reason the chain is invalid. */
  violationReason?: string;
}

export function ChainIntegrityBanner({
  verified,
  violationEventIndex,
  violationReason,
}: ChainIntegrityBannerProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Hash Chain Integrity
        </h2>
        <div onClick={(e) => e.stopPropagation()}>
          <HelpText trigger="icon">
            Each creative action is cryptographically linked to the one before it.
            Verification compares the events stored in this browser against that chain,
            so changes to the stored history are detected. It does not prove when events
            originally happened and is not independently witnessed.
          </HelpText>
        </div>
      </div>
      {verified !== null && (
        <div className="mt-1 text-xs">
          {verified ? (
            <p className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="ml-1.5">This song&apos;s stored history matches its hash chain (verified on this device)</span>
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 text-destructive">
              <p className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Chain integrity violation detected
              </p>
              {violationEventIndex != null && violationEventIndex >= 0 && (
                <p className="ml-5 text-muted-foreground">
                  The event at position {violationEventIndex + 1} in the timeline (event #{violationEventIndex + 1}) breaks the chain.
                </p>
              )}
              {violationReason && (
                <p className="ml-5 text-muted-foreground max-w-xl">
                  {violationReason}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
