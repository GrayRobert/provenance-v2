import type { UserProfileResponse } from './api';

/**
 * Author snapshot: the songwriter-supplied identity details frozen into an
 * export at the moment it is created. Editing the profile later never
 * rewrites an export that already exists - each export carries its own copy.
 *
 * The label used wherever these details render:
 * "Author details supplied by the songwriter" (self-supplied, not verified).
 */
export const AUTHOR_SUPPLIED_LABEL = 'Author details supplied by the songwriter';

export interface AuthorSnapshot {
  songwriterName?: string;
  legalName?: string;
  contactOrWebsite?: string;
  /** ISO time the export (and this snapshot) was created. */
  snapshotAt: string;
}

type ProfileForSnapshot = Pick<
  UserProfileResponse,
  | 'userId'
  | 'authorName'
  | 'authorNameObfuscate'
  | 'legalName'
  | 'contactOrWebsite'
  | 'showAuthorNameOnExport'
  | 'showLegalNameOnExport'
  | 'showContactOnExport'
> | null;

function obfuscatedOwnerId(userId: string): string {
  return `Owner #${userId.replace(/-/g, '').slice(0, 8)}`;
}

/**
 * Build the snapshot for one export, honoring the songwriter's choices:
 * the obfuscate toggle and the per-field "show on exports" switches.
 * Returns null when there is nothing the songwriter chose to show.
 */
export function buildAuthorSnapshot(
  profile: ProfileForSnapshot,
  now: Date = new Date()
): AuthorSnapshot | null {
  const snapshot: AuthorSnapshot = { snapshotAt: now.toISOString() };
  if (profile) {
    if (profile.showAuthorNameOnExport) {
      if (profile.authorNameObfuscate) {
        snapshot.songwriterName = obfuscatedOwnerId(profile.userId);
      } else {
        const name = profile.authorName?.trim();
        if (name) snapshot.songwriterName = name;
      }
    }
    const legal = profile.legalName?.trim();
    if (profile.showLegalNameOnExport && legal) snapshot.legalName = legal;
    const contact = profile.contactOrWebsite?.trim();
    if (profile.showContactOnExport && contact) snapshot.contactOrWebsite = contact;
  }
  if (!snapshot.songwriterName && !snapshot.legalName && !snapshot.contactOrWebsite) {
    return null;
  }
  return snapshot;
}

/** Plain-text block appended to text exports. */
export function authorSnapshotAsText(snapshot: AuthorSnapshot): string {
  const lines = [AUTHOR_SUPPLIED_LABEL + ` (snapshot ${snapshot.snapshotAt})`];
  if (snapshot.songwriterName) lines.push(`Songwriter: ${snapshot.songwriterName}`);
  if (snapshot.legalName) lines.push(`Legal name: ${snapshot.legalName}`);
  if (snapshot.contactOrWebsite) lines.push(`Contact: ${snapshot.contactOrWebsite}`);
  return lines.join('\n');
}
