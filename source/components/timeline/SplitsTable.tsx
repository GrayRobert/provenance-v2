'use client';

interface Split {
  name: string;
  role: string;
  share: number;
}

export function SplitsTable({ data }: { data: { splits: Split[] } }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Ownership Splits
      </h2>
      <div className="flex flex-col gap-3">
        {data.splits.map((split) => (
          <div key={split.name} className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-foreground">{split.name}</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {split.share}%
                </p>
              </div>
              <p className="mt-0.5 text-xs text-muted">{split.role}</p>
            </div>
          </div>
        ))}
        <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-border">
          {data.splits.map((split, i) => {
            const colors = ['bg-accent', 'bg-foreground/30', 'bg-foreground/15'];
            return (
              <div
                key={split.name}
                className={`${colors[i % colors.length]} transition-all`}
                style={{ width: `${split.share}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
