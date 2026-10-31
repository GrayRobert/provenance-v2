
/**
 * Supplement szaza-guitar.json with barre-from-open shapes (e.g. Am7 barred at 2 → Bm7).
 * Open shapes for roots A and E are transposed to all 12 keys; positions are added only
 * if that exact fret pattern is not already present (deduplication against szaza data).
 * Run from repo root after fetch-szaza-chords.js and add-power-chords.js:
 *   node scripts/add-barre-from-open.js
 * Then re-seed: node scripts/seed-chord-library.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LIB_PATH = path.join(REPO_ROOT, 'data', 'szaza-guitar.json');

const KEYS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];

const KEY_TO_SEMITONE = {
  A: 9,
  'A#': 10,
  B: 11,
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
};

const MAX_FRET = 12;

/**
 * Open shapes (root, suffix) → one position. Frets are absolute; -1 muted, 0 open, n = fret n.
 * Mirrors chordVoicings.ts E_SHAPE_* and A_SHAPE_* (root at fret 0).
 */
const OPEN_SHAPES = [
  // E-root shapes (root on 6th string)
  { rootKey: 'E', suffix: 'major', frets: [0, 0, 2, 2, 2, 0] },
  { rootKey: 'E', suffix: 'minor', frets: [0, 0, 2, 2, 1, 0] },
  { rootKey: 'E', suffix: '7', frets: [0, 0, 2, 1, 2, 0] },
  { rootKey: 'E', suffix: 'm7', frets: [0, 0, 2, 0, 2, 0] },
  { rootKey: 'E', suffix: 'maj7', frets: [0, 0, 2, 1, 1, 0] },
  // A-root shapes (root on 5th string)
  { rootKey: 'A', suffix: 'major', frets: [-1, 0, 2, 2, 2, 0] },
  { rootKey: 'A', suffix: 'minor', frets: [-1, 0, 2, 2, 1, 0] },
  { rootKey: 'A', suffix: '7', frets: [-1, 0, 2, 0, 2, 0] },
  { rootKey: 'A', suffix: 'm7', frets: [-1, 0, 2, 0, 1, 0] },
  { rootKey: 'A', suffix: 'maj7', frets: [-1, 0, 2, 1, 2, 0] },
];

function positionAlreadyExists(positions, newPos) {
  const a = newPos.frets;
  return positions.some(
    (p) =>
      p.frets &&
      p.frets.length === 6 &&
      p.frets[0] === a[0] &&
      p.frets[1] === a[1] &&
      p.frets[2] === a[2] &&
      p.frets[3] === a[3] &&
      p.frets[4] === a[4] &&
      p.frets[5] === a[5]
  );
}

/**
 * Infer barre frets (absolute): frets held on 2+ adjacent strings.
 */
function inferBarres(frets) {
  const byFret = new Map();
  for (let i = 0; i < frets.length; i++) {
    const f = frets[i];
    if (f <= 0) continue;
    if (!byFret.has(f)) byFret.set(f, []);
    byFret.get(f).push(i);
  }
  const barres = [];
  for (const [fret, indices] of byFret) {
    if (indices.length < 2) continue;
    indices.sort((a, b) => a - b);
    for (let i = 0; i < indices.length - 1; i++) {
      if (indices[i + 1] === indices[i] + 1) {
        barres.push(fret);
        break;
      }
    }
  }
  return [...new Set(barres)].sort((a, b) => a - b);
}

/**
 * Transpose frets by semitones. -1 stays -1; positive frets are shifted and capped at MAX_FRET.
 */
function transposeFrets(frets, semitones) {
  return frets.map((f) => {
    if (f < 0) return f;
    const t = f + semitones;
    return t > MAX_FRET ? MAX_FRET : t;
  });
}

function main() {
  const data = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));
  if (!data.chords) data.chords = {};

  const addedBySuffix = {};
  let totalAdded = 0;

  for (const shape of OPEN_SHAPES) {
    const { rootKey, suffix, frets } = shape;
    const rootSemitone = KEY_TO_SEMITONE[rootKey];
    if (rootSemitone === undefined) continue;

    for (const targetKey of KEYS) {
      const targetSemitone = KEY_TO_SEMITONE[targetKey];
      if (targetSemitone === undefined) continue;

      const semitones = (targetSemitone - rootSemitone + 12) % 12;
      const transposedFrets = transposeFrets(frets, semitones);

      let entries = data.chords[targetKey];
      if (!entries) {
        data.chords[targetKey] = [];
        entries = data.chords[targetKey];
      }

      let entry = entries.find((e) => e.suffix === suffix);
      if (!entry) {
        entry = { key: targetKey, suffix, positions: [] };
        entries.push(entry);
      }

      const newPos = {
        frets: transposedFrets,
        barres: inferBarres(transposedFrets),
        capo: semitones > 0,
        _source: 'barre-from-open',
      };
      if (newPos.barres.length === 0) newPos.barres = undefined;

      if (!positionAlreadyExists(entry.positions, newPos)) {
        entry.positions.push(newPos);
        totalAdded++;
        addedBySuffix[suffix] = (addedBySuffix[suffix] || 0) + 1;
      }
    }
  }

  // Order: open chords first, then barre-from-open, then the rest (so barre-from-open are "first bar chords" after open).
  for (const key of KEYS) {
    const entries = data.chords[key] || [];
    for (const entry of entries) {
      if (!entry.positions || entry.positions.length < 2) continue;
      entry.positions.sort((a, b) => {
        const aOpen = (a.frets || []).includes(0);
        const bOpen = (b.frets || []).includes(0);
        if (aOpen && !bOpen) return -1;
        if (!aOpen && bOpen) return 1;
        const aGen = a._source === 'barre-from-open';
        const bGen = b._source === 'barre-from-open';
        if (aGen && !bGen) return -1;
        if (!aGen && bGen) return 1;
        return 0;
      });
    }
  }

  fs.writeFileSync(LIB_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log('add-barre-from-open: added', totalAdded, 'positions (deduplicated against existing).');
  if (Object.keys(addedBySuffix).length) {
    console.log('By suffix:', addedBySuffix);
  }
}

main();
