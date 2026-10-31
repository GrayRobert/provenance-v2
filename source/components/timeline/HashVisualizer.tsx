'use client';

/**
 * Renders a visual fingerprint grid from a SHA-256 hash string.
 * Uses provenance accent (orange) as first colour; no green.
 */
export function HashVisualizer({
  hash,
  size = 8,
}: {
  hash: string;
  size?: number;
}) {
  const cleanHash = hash.replace(/^0x/, '');
  const cells = cleanHash.slice(0, size * size).split('');

  // Accent-first palette: provenance orange, then blue, purple, muted orange, yellow
  const PALETTE = [
    'var(--accent)',           // provenance orange (replaces green)
    'hsl(210, 60%, 50%)',      // blue
    'hsl(270, 50%, 55%)',      // purple
    'hsl(25, 85%, 45%)',       // darker orange
    'hsl(45, 90%, 50%)',       // yellow
  ];

  return (
    <div
      className="inline-grid shrink-0 gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      aria-label={`Visual fingerprint for hash ${hash.slice(0, 16)}...`}
      role="img"
    >
      {cells.map((char, i) => {
        const value = parseInt(char, 16);
        const opacity = 0.2 + (value / 15) * 0.8;
        const color = PALETTE[value % PALETTE.length];
        return (
          <div
            key={i}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ backgroundColor: color, opacity }}
          />
        );
      })}
    </div>
  );
}
