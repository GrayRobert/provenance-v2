import { Event } from './types';

/**
 * Converts an event into a human-readable description
 */
export function getHumanReadableDescription(event: Event): string {
  try {
    const payload = JSON.parse(event.payload);
    
    switch (event.eventType) {
      case 'SongCreatedEvent':
        return 'Song created';
      
      case 'SongTitleSetEvent':
        const newTitle = payload.newTitle || payload.title || 'Untitled';
        const previousTitle = payload.previousTitle;
        
        // Show diff if there was a previous title
        if (previousTitle) {
          return `Title changed: "${previousTitle}" → "${newTitle}"`;
        }
        
        return `Title set to "${newTitle}"`;
      
      case 'SectionAddedEvent':
        return `Section created: ${payload.label || payload.sectionType || 'New section'}`;

      case 'SongScaffoldAppliedEvent': {
        const name = payload.structureName || 'Structure';
        const genre = payload.genreName ? ` (${payload.genreName})` : '';
        return `Song structure applied: ${name}${genre}`;
      }

      case 'SectionEditedEvent': {
        const parts: string[] = [];
        if (payload.previousType !== undefined && payload.type !== undefined && payload.previousType !== payload.type) {
          parts.push(`type: ${payload.previousType} → ${payload.type}`);
        }
        if (payload.previousLabel !== undefined && payload.label !== undefined && payload.previousLabel !== payload.label) {
          parts.push(`title: "${payload.previousLabel || ''}" → "${payload.label || ''}"`);
        }
        if (parts.length === 0) return 'Section updated';
        return `Section edited (${parts.join(', ')})`;
      }
      
      case 'SectionRenamedEvent':
        return `Section renamed to ${payload.label || 'Unnamed'}`;
      
      case 'LineAddedEvent':
        const lineText = payload.text || '';
        const truncatedLine = lineText.length > 60 
          ? lineText.substring(0, 60) + '...' 
          : lineText;
        return `Line written: "${truncatedLine}"`;
      
      case 'LineEditedEvent':
        const newText = payload.newText || payload.text || '';
        const previousText = payload.previousText || '';

        // Show diff if we have both texts
        if (previousText && newText) {
          const truncatedOld = previousText.length > 40
            ? previousText.substring(0, 40) + '...'
            : previousText;
          const truncatedNew = newText.length > 40
            ? newText.substring(0, 40) + '...'
            : newText;
          return `Line edited: "${truncatedOld}" → "${truncatedNew}"`;
        }

        // Fallback to just showing new text
        const truncatedEdit = newText.length > 60
          ? newText.substring(0, 60) + '...'
          : newText;
        return newText ? `Line edited: "${truncatedEdit}"` : 'Line edited';

      case 'TabAddedEvent': {
        const bars = payload.barCount != null ? ` (${payload.barCount} bar${payload.barCount === 1 ? '' : 's'})` : '';
        const preset =
          payload.widthPreset && typeof payload.widthPreset === 'string'
            ? ` · ${payload.widthPreset} width`
            : '';
        return `Guitar tab added${bars}${preset}`;
      }

      case 'TabEditedEvent': {
        const barsE = payload.barCount != null ? ` (${payload.barCount} bar${payload.barCount === 1 ? '' : 's'})` : '';
        const presetE =
          payload.widthPreset && typeof payload.widthPreset === 'string'
            ? ` · ${payload.widthPreset} width`
            : '';
        return `Guitar tab updated${barsE}${presetE}`;
      }

      case 'TabArchivedEvent':
        return 'Guitar tab removed';

      case 'MeasureRowAddedEvent': {
        const n = Number(payload.lineCount ?? 1);
        return n > 1 ? `Measure row added (${n} lines)` : 'Measure row added';
      }

      case 'MeasureRowEditedEvent': {
        const n = Number(payload.lineCount ?? 1);
        return n > 1 ? `Measure row updated (${n} lines)` : 'Measure row updated';
      }
      
      case 'LineArchivedEvent':
        return 'Line removed';
      
      case 'ChordAddedEvent':
        return `Chord added: ${payload.chordSymbol || '?'}`;
      
      case 'ChordEditedEvent':
        if (payload.previousSymbol && payload.newSymbol) {
          return `Chord changed: ${payload.previousSymbol} → ${payload.newSymbol}`;
        }
        return `Chord edited: ${payload.newSymbol || '?'}`;
      
      case 'VoicingSelectedEvent':
        return payload.voicingId ? 'Voicing selected' : 'Voicing cleared';
      
      case 'ChordMovedEvent':
        return `Chord repositioned`;
      
      case 'ChordOrphanedEvent':
        return `Chord orphaned (word deleted): ${payload.chordSymbol || '?'}`;

      case 'ChordRemovedEvent':
        return `Chord removed: ${payload.chordSymbol || '?'}`;
      
      case 'SongArchivedEvent':
        return 'Song archived';

      case 'NoteAddedEvent':
        return `Note added: ${payload.title ? `"${payload.title}"` : 'Untitled note'}`;

      case 'NoteEditedEvent':
        return `Note edited: ${payload.title ? `"${payload.title}"` : 'Note'}`;

      case 'NoteArchivedEvent':
        return 'Note archived';

      case 'LyricsScanAddedEvent':
        return 'Lyrics scan added';

      case 'LyricsFileAddedEvent':
        return 'Lyrics file imported';

      case 'VideoAddedEvent':
        return 'Video added';

      case 'VideoArchivedEvent':
        return 'Video archived';

      case 'LyricsScanArchivedEvent':
        return 'Lyrics scan archived';

      case 'RecordingArchivedEvent':
        return 'Recording archived';

      case 'NoteUnarchivedEvent':
        return 'Note unarchived';

      case 'VideoUnarchivedEvent':
        return 'Video unarchived';

      case 'LyricsScanUnarchivedEvent':
        return 'Lyrics scan unarchived';

      case 'RecordingUnarchivedEvent':
        return 'Recording unarchived';

      case 'SongSharedWithTeamEvent':
        return payload.teamName
          ? `Shared with team "${payload.teamName}"`
          : 'Shared with team';

      case 'WorkMetadataItemAddedEvent':
        return `Metadata added: ${payload.name ? `"${payload.name}"` : 'item'}`;

      case 'WorkMetadataItemEditedEvent': {
        const name = payload.name ?? 'Metadata';
        if (payload.previousValue !== undefined && payload.value !== undefined && payload.previousValue !== payload.value) {
          const oldV = String(payload.previousValue).length > 30 ? String(payload.previousValue).slice(0, 30) + '…' : payload.previousValue;
          const newV = String(payload.value).length > 30 ? String(payload.value).slice(0, 30) + '…' : payload.value;
          return `Metadata "${name}": "${oldV}" → "${newV}"`;
        }
        if (payload.previousName !== undefined && payload.previousName !== payload.name) {
          return `Metadata renamed: "${payload.previousName}" → "${name}"`;
        }
        return `Metadata updated: ${name}`;
      }

      case 'WorkMetadataItemArchivedEvent':
        return 'Metadata item archived';

      case 'WorkMetadataItemUnarchivedEvent':
        return 'Metadata item unarchived';

      default:
        return event.eventType.replace(/Event$/, '').replace(/([A-Z])/g, ' $1').trim();
    }
  } catch (error) {
    // If payload parsing fails, return a generic description
    return event.eventType.replace(/Event$/, '').replace(/([A-Z])/g, ' $1').trim();
  }
}

/**
 * Gets the primary action verb for an event type
 */
export function getEventPrimaryAction(eventType: string): string {
  if (eventType.includes('Created')) return 'created';
  if (eventType.includes('Added')) return 'added';
  if (eventType.includes('Edited')) return 'edited';
  if (eventType.includes('Removed') || eventType.includes('Archived')) return 'removed';
  if (eventType.includes('Set')) return 'set';
  if (eventType.includes('Renamed')) return 'renamed';
  return 'updated';
}

/**
 * Gets a short summary for a group of events
 */
export function getEventsSummary(events: Event[]): string {
  const counts = {
    lines: 0,
    sections: 0,
    chords: 0,
    edits: 0,
    tabs: 0,
    measures: 0,
  };

  for (const event of events) {
    if (event.eventType === 'LineAddedEvent') counts.lines++;
    if (event.eventType === 'SectionAddedEvent') counts.sections++;
    if (event.eventType === 'ChordAddedEvent') counts.chords++;
    if (event.eventType === 'LineEditedEvent') counts.edits++;
    if (event.eventType === 'TabEditedEvent') counts.edits++;
    if (event.eventType === 'TabAddedEvent') counts.lines += 6;
    if (event.eventType === 'TabAddedEvent' || event.eventType === 'TabEditedEvent' || event.eventType === 'TabArchivedEvent') counts.tabs++;
    if (event.eventType === 'MeasureRowAddedEvent' || event.eventType === 'MeasureRowEditedEvent') counts.measures++;
    if (event.eventType === 'SectionEditedEvent') counts.edits++;
  }

  const parts: string[] = [];
  if (counts.lines > 0) parts.push(`${counts.lines} line${counts.lines > 1 ? 's' : ''} written`);
  if (counts.sections > 0) parts.push(`${counts.sections} section${counts.sections > 1 ? 's' : ''} created`);
  if (counts.chords > 0) parts.push(`${counts.chords} chord${counts.chords > 1 ? 's' : ''} added`);
  if (counts.tabs > 0) parts.push(`${counts.tabs} tab action${counts.tabs > 1 ? 's' : ''}`);
  if (counts.measures > 0) parts.push(`${counts.measures} measure row action${counts.measures > 1 ? 's' : ''}`);
  if (counts.edits > 0) parts.push(`${counts.edits} edit${counts.edits > 1 ? 's' : ''}`);

  return parts.join(' · ') || 'No activity';
}

