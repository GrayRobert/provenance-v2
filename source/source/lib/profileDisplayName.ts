import type { UserProfileResponse } from '@/lib/api';

/**
 * Header / profile chip: first word of display name, else email local part (before @), else "Profile".
 * Matches AppHeader behavior.
 */
export function profileDisplayName(
  profile: Pick<UserProfileResponse, 'displayName'> | null,
  email: string | undefined
): string {
  if (profile?.displayName?.trim()) {
    const first = profile.displayName.trim().split(/\s+/)[0];
    if (first) return first;
  }
  if (email) return email.split('@')[0] ?? email;
  return 'Profile';
}

/**
 * Full display string for chat / presence: display name, then author name, then email local part, then username.
 */
export function accountDisplayLabel(p: {
  displayName?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  authorUsername?: string | null;
}): string {
  const primary = p.displayName?.trim() || p.authorName?.trim();
  if (primary) return primary;
  const email = p.authorEmail?.trim();
  if (email) {
    const local = email.split('@')[0];
    return local ?? email;
  }
  const u = p.authorUsername?.trim();
  if (u) return u;
  return '?';
}

/**
 * Chat row label for another user (message author row).
 * Backend merges display + author into {@link authorDisplayName}.
 */
export function chatMessageAuthorLabel(message: {
  authorDisplayName: string | null;
  authorEmail?: string | null;
  authorUsername: string | null;
}): string {
  return accountDisplayLabel({
    displayName: message.authorDisplayName,
    authorEmail: message.authorEmail,
    authorUsername: message.authorUsername,
  });
}
