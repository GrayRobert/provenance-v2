/**
 * Types for the batch command API (optimistic sync).
 * Commands match backend BatchCommandDescriptorDTO / SongCommandBatchService.
 */

export type BatchCommand =
  | { type: 'SetTitle'; payload: { title: string } }
  | { type: 'AddSection'; payload: { sectionType: string; label: string }; clientGeneratedId?: string }
  | { type: 'EditSection'; payload: { sectionId: string; sectionType: string; label: string } }
  | { type: 'RepositionSection'; payload: { sectionId: string; newOrderIndex: number } }
  | { type: 'ArchiveSection'; payload: { sectionId: string } }
  | {
      type: 'AddLine';
      payload: { sectionId: string; text: string; source?: string; afterLineId?: string };
      clientGeneratedId?: string;
    }
  | { type: 'EditLine'; payload: { lineId: string; text: string; source?: string } }
  | {
      type: 'AddTabBlock';
      payload: {
        sectionId: string;
        lines: { lineId?: string; text: string }[];
        barCount?: number;
        widthPreset?: string;
        source?: string;
      };
    }
  | {
      type: 'EditTabBlock';
      payload: {
        lines: { lineId: string; text: string }[];
        barCount?: number;
        widthPreset?: string;
        source?: string;
      };
    }
  | { type: 'ArchiveLine'; payload: { lineId: string } }
  | {
      type: 'AddChord';
      payload: { lineId: string; tokenId: string | null; charOffset: number; chordSymbol: string };
      clientGeneratedId?: string;
    }
  | { type: 'EditChord'; payload: { chordId: string; symbol: string } }
  | { type: 'RemoveChord'; payload: { chordId: string } }
  | {
      type: 'MoveChord';
      /** lineId + absoluteCharOffset: server resolves real token UUID (client may use placeholder token ids). */
      payload: { chordId: string; lineId: string; absoluteCharOffset: number };
    }
  | { type: 'SetChordVoicing'; payload: { chordId: string; voicingId: string | null } }
  | {
      type: 'RecordSongScaffold';
      payload: {
        genreId: string;
        genreName: string;
        structureId: string;
        structureName: string;
        source?: string;
      };
    };

export interface BatchCommandRequest {
  commands: BatchCommand[];
  expectedAfterSequence?: number;
}

export type BatchCommandResultType = 'addLine' | 'addSection' | 'addChord';

export interface BatchCommandResultItem {
  type: BatchCommandResultType;
  id: string;
}

export interface BatchCommandResponse {
  lastEventSequence: number;
  results?: BatchCommandResultItem[];
}
