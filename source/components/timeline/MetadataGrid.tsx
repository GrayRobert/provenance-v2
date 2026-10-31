'use client';

export interface WorkMetadataItemDisplay {
  name: string;
  value: string;
}

function MetaField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted">
        {label}
      </p>
      <p
        className={`text-sm font-medium text-foreground ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}

/** Mono-style keys (codes, numbers) for consistent display */
const MONO_KEYS = new Set(['ISRC', 'ISWC', 'Duration', 'BPM']);

export function MetadataGrid({ data }: { data: { items: WorkMetadataItemDisplay[] } }) {
  const items = data.items ?? [];
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Work Metadata
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted col-span-full">No metadata added yet.</p>
        ) : (
          items.map((item, i) => (
            <MetaField
              key={`${item.name}-${i}`}
              label={item.name}
              value={item.value || '—'}
              mono={MONO_KEYS.has(item.name)}
            />
          ))
        )}
      </div>
    </div>
  );
}
