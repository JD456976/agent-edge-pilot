import { formatDistanceToNowStrict } from 'date-fns';

/**
 * Format a date string as a relative timestamp like "3h ago" or "2d ago".
 * Falls back to locale string for dates older than 30 days.
 */
export function relativeTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return 'just now';
    if (diffMs > 30 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return formatDistanceToNowStrict(date, { addSuffix: true });
  } catch {
    return '—';
  }
}
