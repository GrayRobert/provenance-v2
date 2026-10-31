'use client';

import { useEffect, useState } from 'react';
import { profileApi, effectiveAvatarUrl, type UserProfileResponse } from '@/lib/api';
import { AUTHOR_SUPPLIED_LABEL } from '@/lib/authorSnapshot';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/shared/Avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function avatarFallbackText(displayName: string | null, email: string | undefined): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
      : displayName.trim().slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export type ProfileDetailsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial profile (e.g. from header). If null when open, modal will fetch. */
  profile: UserProfileResponse | null;
  userEmail?: string;
  onSaved?: (profile: UserProfileResponse) => void;
};

export function ProfileDetailsModal({
  open,
  onOpenChange,
  profile: initialProfile,
  userEmail,
  onSaved,
}: ProfileDetailsModalProps) {
  const [profile, setProfile] = useState<UserProfileResponse | null>(initialProfile);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorNameObfuscate, setAuthorNameObfuscate] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [contactOrWebsite, setContactOrWebsite] = useState('');
  const [showAuthorNameOnExport, setShowAuthorNameOnExport] = useState(true);
  const [showLegalNameOnExport, setShowLegalNameOnExport] = useState(false);
  const [showContactOnExport, setShowContactOnExport] = useState(false);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    if (open && !profile) {
      setLoading(true);
      setError(null);
      profileApi
        .getProfile()
        .then((p) => {
          setProfile(p);
          setDisplayName(p.displayName ?? '');
          setAvatarUrl(p.avatarUrl ?? '');
          setAuthorName(p.authorName ?? '');
          setAuthorNameObfuscate(p.authorNameObfuscate ?? false);
          setLegalName(p.legalName ?? '');
          setContactOrWebsite(p.contactOrWebsite ?? '');
          setShowAuthorNameOnExport(p.showAuthorNameOnExport ?? true);
          setShowLegalNameOnExport(p.showLegalNameOnExport ?? false);
          setShowContactOnExport(p.showContactOnExport ?? false);
        })
        .catch(() => setError('Could not load profile.'))
        .finally(() => setLoading(false));
    } else if (open && profile) {
      setDisplayName(profile.displayName ?? '');
      setAvatarUrl(profile.avatarUrl ?? '');
      setAuthorName(profile.authorName ?? '');
      setAuthorNameObfuscate(profile.authorNameObfuscate ?? false);
      setLegalName(profile.legalName ?? '');
      setContactOrWebsite(profile.contactOrWebsite ?? '');
      setShowAuthorNameOnExport(profile.showAuthorNameOnExport ?? true);
      setShowLegalNameOnExport(profile.showLegalNameOnExport ?? false);
      setShowContactOnExport(profile.showContactOnExport ?? false);
      setError(null);
    }
  }, [open, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await profileApi.updateProfile({
        displayName: displayName.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        authorName: authorName.trim() || null,
        authorNameObfuscate,
        legalName: legalName.trim() || null,
        contactOrWebsite: contactOrWebsite.trim() || null,
        showAuthorNameOnExport,
        showLegalNameOnExport,
        showContactOnExport,
      });
      setProfile(updated);
      onSaved?.(updated);
      onOpenChange(false);
    } catch {
      setError('Could not update profile. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Songwriter Profile</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          {AUTHOR_SUPPLIED_LABEL} - shown on your songs and exports as you provide them, not
          independently verified. Each export keeps its own snapshot, so later edits here never
          rewrite an export you already made.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading profile…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <div>
              <label htmlFor="profile-modal-email" className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <p id="profile-modal-email" className="text-sm text-muted-foreground">{profile?.email ?? userEmail ?? '—'}</p>
            </div>
            <div>
              <label htmlFor="profile-modal-displayName" className="block text-sm font-medium text-foreground mb-1">
                Display name
              </label>
              <input
                id="profile-modal-displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Name or pen name shown in the header"
                className="block w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="profile-modal-authorName" className="block text-sm font-medium text-foreground mb-1">
                Author name
              </label>
              <p className="text-xs text-muted-foreground mb-1">
                Shown on the timeline and certificate for the ownership split on your songs.
              </p>
              <input
                id="profile-modal-authorName"
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="e.g. songwriter or band name"
                className="block w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <label htmlFor="profile-modal-authorNameObfuscate" className="block text-sm font-medium text-foreground mb-0.5">
                  Obfuscate author name on timeline
                </label>
                <p className="text-xs text-muted-foreground">
                  When on, a unique identifier is shown instead of your author name on the timeline and certificate.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={authorNameObfuscate}
                onClick={() => setAuthorNameObfuscate((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background ${
                  authorNameObfuscate ? 'bg-accent' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                    authorNameObfuscate ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div>
              <label htmlFor="profile-modal-legalName" className="block text-sm font-medium text-foreground mb-1">
                Legal name (optional)
              </label>
              <input
                id="profile-modal-legalName"
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Only if you want it on exports"
                className="block w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="profile-modal-contactOrWebsite" className="block text-sm font-medium text-foreground mb-1">
                Contact or website (optional)
              </label>
              <input
                id="profile-modal-contactOrWebsite"
                type="text"
                value={contactOrWebsite}
                onChange={(e) => setContactOrWebsite(e.target.value)}
                placeholder="e.g. your site, email or social link"
                className="block w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
            <fieldset className="border border-border rounded-md p-3 space-y-2">
              <legend className="text-sm font-medium text-foreground px-1">Show on exported Song History</legend>
              {([
                ['author', showAuthorNameOnExport, setShowAuthorNameOnExport, 'Songwriter name'],
                ['legal', showLegalNameOnExport, setShowLegalNameOnExport, 'Legal name'],
                ['contact', showContactOnExport, setShowContactOnExport, 'Contact or website'],
              ] as const).map(([key, value, setter, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setter(e.target.checked)}
                    className="h-4 w-4 accent-[#f6992c]"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <div>
              <label htmlFor="profile-modal-avatarUrl" className="block text-sm font-medium text-foreground mb-1">
                Avatar URL
              </label>
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 shrink-0">
                  {(() => {
                    const src = effectiveAvatarUrl(avatarUrl);
                    return src ? <AvatarImage src={src} alt="" width={48} height={48} /> : null;
                  })()}
                  <AvatarFallback className="bg-accent/20 text-accent text-sm font-medium">
                    {avatarFallbackText(profile?.displayName ?? null, userEmail)}
                  </AvatarFallback>
                </Avatar>
                <input
                  id="profile-modal-avatarUrl"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  className="block flex-1 min-w-0 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-border text-foreground hover:bg-border/50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
