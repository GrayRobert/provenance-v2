/**
 * Format TSA timestamp (ISO string) for display: human-readable UTC datetime.
 * e.g. "Feb 14, 2025, 3:30:00 PM UTC"
 */
export function formatTsTimestamp(iso: string): string {
  return (
    new Date(iso).toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }) + ' UTC'
  );
}
