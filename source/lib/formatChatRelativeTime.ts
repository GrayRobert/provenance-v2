/**
 * Human-readable relative time for chat message rows (local timezone).
 * Buckets: Just now, Nm ago, Nh ago, Yesterday, Nd ago, weeks, months, last year, N years ago.
 */
export function formatChatRelativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const ms = now.getTime() - d.getTime();
  if (ms < 0) return 'Just now';

  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'Just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const startOf = (x: Date) => {
    const t = new Date(x);
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  };

  const sodNow = startOf(now);
  const sodMsg = startOf(d);
  const dayDiff = Math.round((sodNow - sodMsg) / 86400000);

  if (dayDiff === 0) {
    const hr = Math.floor(ms / 3600000);
    return `${Math.max(1, hr)}h ago`;
  }

  if (dayDiff === 1) return 'Yesterday';

  if (dayDiff < 7) return `${dayDiff}d ago`;

  if (dayDiff < 14) return '1 week ago';

  const weeks = Math.floor(dayDiff / 7);
  if (dayDiff < 60) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;

  const monthDiff =
    (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());

  if (monthDiff < 1) return `${dayDiff}d ago`;
  if (monthDiff === 1) return '1 month ago';
  if (monthDiff < 12) return `${monthDiff} months ago`;

  const years = now.getFullYear() - d.getFullYear();
  if (years === 1) return 'Last year';
  if (years > 1) return `${years} years ago`;

  return 'Last year';
}
