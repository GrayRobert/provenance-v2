/**
 * Event type → badge colour for certificate/timeline.
 * Uses provenance accent (orange) instead of green for creation/milestone events.
 */
export type BadgeVariant = 'accent' | 'orange' | 'purple' | 'blue' | 'neutral';

const variantClasses: Record<BadgeVariant, string> = {
  accent: 'bg-accent/20 text-accent',
  orange: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  purple: 'bg-purple-500/20 text-purple-800 dark:text-purple-300',
  blue: 'bg-blue-500/20 text-blue-800 dark:text-blue-300',
  neutral: 'bg-muted/50 text-muted',
};

/** Map event type to badge variant (accent = provenance orange). */
export function getEventBadgeVariant(eventType: string): BadgeVariant {
  if (
    eventType === 'TabAddedEvent' ||
    eventType === 'TabEditedEvent' ||
    eventType === 'TabArchivedEvent'
  ) {
    return 'blue';
  }
  if (eventType === 'MeasureRowAddedEvent' || eventType === 'MeasureRowEditedEvent') {
    return 'purple';
  }
  if (
    eventType === 'SongCreatedEvent' ||
    eventType === 'SectionAddedEvent' ||
    eventType === 'SongScaffoldAppliedEvent' ||
    eventType === 'LineAddedEvent' ||
    eventType === 'NoteAddedEvent' ||
    eventType === 'LyricsScanAddedEvent' ||
    eventType === 'LyricsFileAddedEvent' ||
    eventType === 'VideoAddedEvent' ||
    eventType === 'ReleaseEvent' ||
    eventType === 'WorkMetadataItemAddedEvent' ||
    eventType === 'SongSharedWithTeamEvent'
  ) {
    return 'accent';
  }
  if (
    eventType.includes('Edited') ||
    eventType === 'ChordAddedEvent' ||
    eventType === 'ChordEditedEvent' ||
    eventType === 'NoteEditedEvent' ||
    eventType === 'WorkMetadataItemEditedEvent'
  ) {
    return 'orange';
  }
  if (
    eventType === 'NoteArchivedEvent' ||
    eventType === 'VideoArchivedEvent' ||
    eventType === 'LyricsScanArchivedEvent' ||
    eventType === 'RecordingArchivedEvent' ||
    eventType === 'NoteUnarchivedEvent' ||
    eventType === 'VideoUnarchivedEvent' ||
    eventType === 'LyricsScanUnarchivedEvent' ||
    eventType === 'RecordingUnarchivedEvent' ||
    eventType === 'WorkMetadataItemArchivedEvent' ||
    eventType === 'WorkMetadataItemUnarchivedEvent'
  ) {
    return 'neutral';
  }
  if (eventType === 'VoicingSelectedEvent') return 'purple';
  if (
    eventType === 'MasterApprovedEvent' ||
    eventType === 'PublishingAgreementEvent' ||
    eventType === 'SyncLicenseEvent'
  ) {
    return 'blue';
  }
  if (eventType === 'SongTitleSetEvent') return 'neutral';
  return 'neutral';
}

export function getEventBadgeClassName(eventType: string): string {
  return variantClasses[getEventBadgeVariant(eventType)];
}
