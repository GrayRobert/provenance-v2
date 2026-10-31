'use client';

interface MaintenanceOverlayProps {
  onRetry: () => void;
}

export function MaintenanceOverlay({ onRetry }: MaintenanceOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-background px-6 text-center"
      role="alert"
      aria-live="assertive"
      aria-label="Service unavailable"
    >
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold text-foreground">Temporarily unavailable</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We can&apos;t reach the Provenance servers right now. This is usually brief—try again in a
          moment. If the problem continues, check back later.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 min-w-[8rem] items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-hover"
      >
        Try again
      </button>
    </div>
  );
}
