'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/shared/Avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { effectiveAvatarUrl } from '@/lib/api';
import type { TeamMember } from '@/lib/types';

function memberInitials(m: TeamMember): string {
  if (m.displayName?.trim()) {
    const parts = m.displayName.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
      : m.displayName.trim().slice(0, 2).toUpperCase();
  }
  if (m.email) return m.email.slice(0, 2).toUpperCase();
  return '?';
}

export type MemberProfileModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
};

export function MemberProfileModal({
  open,
  onOpenChange,
  member,
}: MemberProfileModalProps) {
  if (!member) return null;

  const avatarSrc = effectiveAvatarUrl(member.avatarUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">Member profile details.</p>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              {avatarSrc ? (
                <AvatarImage src={avatarSrc} alt="" width={64} height={64} />
              ) : null}
              <AvatarFallback className="bg-accent/20 text-accent text-lg font-medium">
                {memberInitials(member)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate">
                {member.displayName || 'Unknown'}
              </p>
              {member.email && (
                <p className="text-sm text-muted-foreground truncate">{member.email}</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Display name
            </label>
            <p className="text-sm text-foreground">
              {member.displayName?.trim() || '—'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Email
            </label>
            <p className="text-sm text-foreground">
              {member.email ?? '—'}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
