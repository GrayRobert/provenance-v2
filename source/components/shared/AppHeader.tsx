'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, PenLine } from 'lucide-react';
import { ProvenanceLogo } from '@/components/shared/ProvenanceLogo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/shared/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/shared/ui/dropdown-menu';
import { ProfileDetailsModal } from '@/components/shared/ProfileDetailsModal';
import { profileDisplayName } from '@/lib/profileDisplayName';
import { cn } from '@/lib/utils';
import { effectiveAvatarUrl, type UserProfileResponse } from '@/lib/api';

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

type AppHeaderProps = {
  profile: UserProfileResponse | null;
  user: { email: string } | null;
  logout?: () => void;
  className?: string;
  /** Called after the songwriter saves their profile so pages can refresh header state. */
  onProfileSaved?: (profile: UserProfileResponse) => void;
};

export function AppHeader({ profile, user, className, onProfileSaved }: AppHeaderProps) {
  const displayName = profileDisplayName(profile, user?.email);
  const avatarSrc = effectiveAvatarUrl(profile?.avatarUrl);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  return (
    <header
      className={cn(
        'no-print relative z-[60] border-b border-border bg-surface shadow-sm',
        className
      )}
    >
      <div className="flex h-16 items-center justify-between pl-4 pr-24 sm:pl-6 sm:pr-24 lg:pl-8 lg:pr-24">
        <Link href="/songs" className="flex items-center text-foreground hover:opacity-90">
          <ProvenanceLogo iconSize={35} />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface data-[state=open]:bg-accent/10">
            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-accent/30">
              {avatarSrc ? (
                <AvatarImage src={avatarSrc} alt="" width={32} height={32} />
              ) : null}
              <AvatarFallback className="bg-accent/20 text-accent text-xs font-medium">
                {avatarFallbackText(profile?.displayName ?? null, user?.email)}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[140px] truncate">{displayName}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</p>
            </div>
            <div className="p-1">
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
                onSelect={() => setProfileModalOpen(true)}
              >
                <PenLine className="size-4 shrink-0 text-muted-foreground" />
                Songwriter Profile
              </DropdownMenuItem>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Songs are stored on this device. Use Export backup on the songs page to keep a copy.
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ProfileDetailsModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        profile={profile}
        userEmail={user?.email}
        onSaved={onProfileSaved}
      />
    </header>
  );
}
