/**
 * Regression tests for the Songwriter Profile feature:
 * - author snapshots freeze the songwriter-supplied details into each export
 *   at export time (later profile edits never rewrite an existing export);
 * - the profile survives backup/restore and merges over defaults so profiles
 *   stored before new fields existed stay valid.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTHOR_SUPPLIED_LABEL, authorSnapshotAsText, buildAuthorSnapshot } from '@/lib/authorSnapshot';
import { buildBackup, getLocalProfile, restoreBackup, saveLocalProfile } from '@/lib/localDb';

const NOW = new Date('2026-10-31T21:00:00.000Z');

const baseProfile = {
  userId: 'local-user',
  authorName: 'R. Gray',
  authorNameObfuscate: false,
  legalName: 'Robert Gray',
  contactOrWebsite: 'https://example.com',
  showAuthorNameOnExport: true,
  showLegalNameOnExport: false,
  showContactOnExport: false,
};

describe('buildAuthorSnapshot', () => {
  it('returns null when there is no profile', () => {
    expect(buildAuthorSnapshot(null, NOW)).toBeNull();
  });

  it('includes only the fields the songwriter chose to show', () => {
    const snap = buildAuthorSnapshot(baseProfile, NOW);
    expect(snap).toEqual({ songwriterName: 'R. Gray', snapshotAt: NOW.toISOString() });
  });

  it('returns null when every show switch is off', () => {
    const snap = buildAuthorSnapshot({ ...baseProfile, showAuthorNameOnExport: false }, NOW);
    expect(snap).toBeNull();
  });

  it('includes legal name and contact only when their switches are on', () => {
    const snap = buildAuthorSnapshot(
      { ...baseProfile, showLegalNameOnExport: true, showContactOnExport: true },
      NOW
    );
    expect(snap).toEqual({
      songwriterName: 'R. Gray',
      legalName: 'Robert Gray',
      contactOrWebsite: 'https://example.com',
      snapshotAt: NOW.toISOString(),
    });
  });

  it('replaces the songwriter name with an obfuscated owner id when obfuscate is on', () => {
    const snap = buildAuthorSnapshot({ ...baseProfile, authorNameObfuscate: true }, NOW);
    expect(snap?.songwriterName).toBe('Owner #localuse');
  });

  it('obfuscate still wins when no author name is set', () => {
    const snap = buildAuthorSnapshot({ ...baseProfile, authorName: null, authorNameObfuscate: true }, NOW);
    expect(snap?.songwriterName).toBe('Owner #localuse');
  });

  it('drops blank values even when their switch is on', () => {
    const snap = buildAuthorSnapshot({ ...baseProfile, authorName: '   ' }, NOW);
    expect(snap).toBeNull();
  });
});

describe('authorSnapshotAsText', () => {
  it('renders the self-supplied label and present fields', () => {
    const snap = buildAuthorSnapshot(
      { ...baseProfile, showLegalNameOnExport: true },
      NOW
    )!;
    const text = authorSnapshotAsText(snap);
    expect(text).toContain(AUTHOR_SUPPLIED_LABEL);
    expect(text).toContain('Songwriter: R. Gray');
    expect(text).toContain('Legal name: Robert Gray');
    expect(text).not.toContain('Contact:');
  });
});

describe('local profile persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('creates a default profile on first read', () => {
    const profile = getLocalProfile();
    expect(profile.authorName).toBeNull();
    expect(profile.showAuthorNameOnExport).toBe(true);
    expect(profile.showLegalNameOnExport).toBe(false);
    expect(profile.createdAt).not.toBe('');
  });

  it('round-trips a saved profile', () => {
    const profile = { ...getLocalProfile(), authorName: 'R. Gray', contactOrWebsite: 'https://example.com' };
    saveLocalProfile(profile);
    const back = getLocalProfile();
    expect(back.authorName).toBe('R. Gray');
    expect(back.contactOrWebsite).toBe('https://example.com');
  });

  it('merges over defaults so old stored profiles stay valid', () => {
    window.localStorage.setItem('prov2.profile', JSON.stringify({ userId: 'local-user', authorName: 'R. Gray' }));
    const back = getLocalProfile();
    expect(back.authorName).toBe('R. Gray');
    expect(back.showAuthorNameOnExport).toBe(true);
    expect(back.linkedAuthMethods).toEqual([]);
  });

  it('carries the profile through backup and restore', async () => {
    saveLocalProfile({ ...getLocalProfile(), authorName: 'R. Gray', legalName: 'Robert Gray' });
    const backup = JSON.stringify(await buildBackup());
    window.localStorage.clear();
    await restoreBackup(backup);
    const back = getLocalProfile();
    expect(back.authorName).toBe('R. Gray');
    expect(back.legalName).toBe('Robert Gray');
  });
});
