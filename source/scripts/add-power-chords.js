
/**
 * Add the traditional two-finger power chord voicings to the "5" chord entry for every key:
 * 1. Root on low E string, 5th on A string (fingers 1 and 4)
 * 2. Root on A string, 5th on D string (fingers 1 and 4)
 * Run from repo root after fetch-szaza-chords.js: node scripts/add-power-chords.js
 * Then run add-barre-from-open.js and seed-chord-library.js (see fetch-szaza-chords.js for full order).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LIB_PATH = path.join(REPO_ROOT, 'data', 'szaza-guitar.json');

const KEYS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];

const ROOT_FRET_ON_LOW_E = {
  E: 0,
  F: 1,
  'F#': 2,
  G: 3,
  'G#': 4,
  A: 5,
  'A#': 6,
  B: 7,
  C: 8,
  'C#': 9,
  D: 10,
  'D#': 11,
};

const ROOT_FRET_ON_A = {
  A: 0,
  'A#': 1,
  B: 2,
  C: 3,
  'C#': 4,
  D: 5,
  'D#': 6,
  E: 7,
  F: 8,
  'F#': 9,
  G: 10,
  'G#': 11,
};

function positionAlreadyExists(positions, newPos) {
  const a = newPos.frets;
  return positions.some(
    (p) =>
      p.frets.length === 6 &&
      p.frets[0] === a[0] &&
      p.frets[1] === a[1] &&
      p.frets[2] === a[2] &&
      p.frets[3] === a[3] &&
      p.frets[4] === a[4] &&
      p.frets[5] === a[5]
  );
}

function powerChordRootOnE(key) {
  const rootFret = ROOT_FRET_ON_LOW_E[key];
  if (rootFret === undefined) return null;
  const fifthFret = rootFret + 2;
  const frets = [rootFret, fifthFret, -1, -1, -1, -1];
  const baseFret = rootFret === 0 ? 1 : rootFret;
  return {
    frets,
    fingers: [1, 4, 0, 0, 0, 0],
    baseFret,
    barres: [],
    capo: false,
    _source: 'szaza',
  };
}

function powerChordRootOnA(key) {
  const rootFret = ROOT_FRET_ON_A[key];
  if (rootFret === undefined) return null;
  const fifthFret = rootFret + 2;
  const frets = [-1, rootFret, fifthFret, -1, -1, -1];
  const baseFret = rootFret === 0 ? 1 : rootFret;
  return {
    frets,
    fingers: [0, 1, 4, 0, 0, 0],
    baseFret,
    barres: [],
    capo: false,
    _source: 'szaza',
  };
}

function main() {
  const data = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));
  let addedE = 0;
  let addedA = 0;

  for (const key of KEYS) {
    const entries = data.chords[key];
    if (!entries) continue;

    const entry5 = entries.find((e) => e.suffix === '5');
    if (!entry5) continue;

    const posE = powerChordRootOnE(key);
    if (posE && !positionAlreadyExists(entry5.positions, posE)) {
      entry5.positions.unshift(posE);
      addedE++;
    }

    const posA = powerChordRootOnA(key);
    if (posA && !positionAlreadyExists(entry5.positions, posA)) {
      entry5.positions.unshift(posA);
      addedA++;
    }
  }

  fs.writeFileSync(LIB_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log('Added power chords: root on E for', addedE, 'keys, root on A for', addedA, 'keys.');
}

main();
