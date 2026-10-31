/**
 * Tests for the local guitar chord library (static per-key JSON port of the hosted
 * Postgres chord library) and local piano-voicing saving.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  getGuitarVoicings,
  getGuitarVoicingById,
  enharmonicSymbol,
  __registerKeyData,
  __clearChordLibraryCache,
} from '@/lib/localChordLibrary';
import { chordLibraryApi, userVoicingsApi } from '@/lib/api';

const FIXTURE = {
  A: [
    {
      id: 'gtr:A:0',
      name: 'Voicing 1',
      chord: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], capo: false },
    },
    {
      id: 'gtr:A:1',
      name: 'Voicing 2',
      chord: { frets: [5, 7, 7, 6, 5, 5], fingers: [1, 3, 4, 2, 1, 1], barres: [5], baseFret: 5 },
    },
  ],
  'A#m7': [
    {
      id: 'gtr:A#m7:0',
      name: 'Voicing 1',
      chord: { frets: [-1, 1, 3, 1, 2, 1], fingers: [0, 1, 3, 1, 2, 1], barres: [1] },
    },
  ],
  'C/E': [
    {
      id: 'gtr:C/E:0',
      name: 'Voicing 1',
      chord: { frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  __clearChordLibraryCache();
  __registerKeyData('A', FIXTURE as never);
  __registerKeyData('Asharp', FIXTURE as never);
  __registerKeyData('C', FIXTURE as never);
});

describe('getGuitarVoicings', () => {
  it('returns voicings in stored order with names and source', async () => {
    const list = await getGuitarVoicings('A');
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Voicing 1');
    expect(list[1].name).toBe('Voicing 2');
    expect(list[0].source).toBe('szaza');
    expect(list[1].chord.barres).toEqual([5]);
  });

  it('resolves flat spellings via the enharmonic fallback (backend parity)', async () => {
    const list = await getGuitarVoicings('Bbm7');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('gtr:A#m7:0');
    expect(enharmonicSymbol('Bbm7')).toBe('A#m7');
    expect(enharmonicSymbol('A#m7')).toBe('Bbm7');
    expect(enharmonicSymbol('Cmaj7')).toBe('Cmaj7');
  });

  it('supports slash-chord symbols', async () => {
    const list = await getGuitarVoicings('C/E');
    expect(list).toHaveLength(1);
    expect(list[0].chord.frets).toEqual([0, 3, 2, 0, 1, 0]);
  });

  it('returns [] for unknown chords and malformed symbols', async () => {
    expect(await getGuitarVoicings('Axyz')).toEqual([]);
    expect(await getGuitarVoicings('')).toEqual([]);
  });
});

describe('getGuitarVoicingById', () => {
  it('round-trips deterministic ids, including slash symbols', async () => {
    const list = await getGuitarVoicings('C/E');
    const byId = await getGuitarVoicingById(list[0].id);
    expect(byId?.chord.frets).toEqual([0, 3, 2, 0, 1, 0]);
  });

  it('returns null for hosted-era UUIDs and unknown indexes', async () => {
    expect(await getGuitarVoicingById('3f6b9f7c-8a44-4a62-9d7f-2b7f6f4c1a2b')).toBeNull();
    expect(await getGuitarVoicingById('gtr:A:99')).toBeNull();
  });
});

describe('chordLibraryApi wiring', () => {
  it('getVoicings serves guitar only', async () => {
    expect((await chordLibraryApi.getVoicings('guitar', 'A')).length).toBe(2);
    expect(await chordLibraryApi.getVoicings('ukulele', 'A')).toEqual([]);
  });

  it('createPianoVoicing stores a local user voicing', async () => {
    const created = await chordLibraryApi.createPianoVoicing({
      symbol: 'Cmaj7',
      notes: ['C', 'E', 'G', 'B'],
      name: 'Root position',
    });
    expect(created.id).toBeTruthy();
    expect(created.chord.notes).toEqual(['C', 'E', 'G', 'B']);
    const stored = await userVoicingsApi.getById(created.id);
    expect(stored?.instrument).toBe('piano');
    expect(stored?.normalizedSymbol).toBe('Cmaj7');
    expect((await userVoicingsApi.list('piano', 'Cmaj7')).length).toBe(1);
  });
});

describe('generated dataset parity (public/chords/guitar)', () => {
  const dir = path.join(__dirname, '..', 'public', 'chords', 'guitar');
  const FILES = ['A', 'Asharp', 'B', 'C', 'Csharp', 'D', 'Dsharp', 'E', 'F', 'Fsharp', 'G', 'Gsharp'];
  type KeyFile = Record<string, Array<{ id: string; name?: string; chord: { frets?: number[] } }>>;

  function load(file: string): KeyFile {
    return JSON.parse(readFileSync(path.join(dir, `${file}.json`), 'utf8')) as KeyFile;
  }

  it('ships all 12 key files with the full dictionary', () => {
    let definitions = 0;
    let voicings = 0;
    for (const f of FILES) {
      const data = load(f);
      for (const [symbol, list] of Object.entries(data)) {
        definitions += 1;
        voicings += list.length;
        list.forEach((v, i) => expect(v.id).toBe(`gtr:${symbol}:${i}`));
      }
    }
    expect(definitions).toBe(8655);
    expect(voicings).toBe(62176);
  });

  it('keeps known shapes from the original validate-chord-coverage checks', () => {
    const B = load('B');
    expect(B['Bm7'].some((v) => JSON.stringify(v.chord.frets) === '[-1,2,0,2,0,2]')).toBe(true);
    const A = load('A');
    expect(A['A'][0].chord.frets).toEqual([-1, 0, 2, 2, 2, 0]);
  });
});
