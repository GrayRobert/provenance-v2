/**
 * Initials for avatar placeholder when there is no image URL.
 * Matches the profile page preview: two words → first + last initial; one word → first two letters;
 * otherwise first two characters of {@link fallbackWhenNoName} (e.g. email or username).
 */
export function avatarFallbackText(
  displayName: string | null | undefined,
  fallbackWhenNoName: string | null | undefined
): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
      : displayName.trim().slice(0, 2).toUpperCase();
  }
  if (fallbackWhenNoName?.trim()) {
    return fallbackWhenNoName.trim().slice(0, 2).toUpperCase();
  }
  return '?';
}
