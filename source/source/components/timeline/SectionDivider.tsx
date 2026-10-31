'use client';

/**
 * Certificate-style section divider with optional label.
 * Dots use bg-accent (provenance orange).
 */
export function SectionDivider({ label }: { label?: string }) {
  if (!label) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-1 w-1 rounded-full bg-accent"
              style={{ opacity: 0.3 + i * 0.175 }}
            />
          ))}
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted">
        {label}
      </p>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
