'use client';

import { cn } from '@/lib/utils';

/**
 * Customer-app-safe "mock data" / "not implemented" indicator.
 * Do not import admin NotImplementedBanner in the customer app.
 */
export function MockDataBanner({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-muted',
        className
      )}
      {...props}
    >
      <span aria-hidden>⚠</span>
      <span>This section is not implemented yet. Displaying mock data.</span>
    </div>
  );
}

export function MockDataBadge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted',
        className
      )}
      {...props}
    >
      Mock data
    </span>
  );
}
