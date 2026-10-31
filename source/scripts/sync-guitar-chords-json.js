/**
 * Build public/chords/guitar/<Key>.json (12 per-key files) from data/szaza-guitar.json.
 *
 * This applies EXACTLY the transforms the hosted backend's seed-chord-library.js applied
 * when inserting into Postgres (suffixToSymbolPart, fret<=12 position filter, display
 * baseFret, "Voicing N" names), so the static files are the same chord dictionary the
 * database served - minus per-seed UUIDs, replaced by deterministic ids
 * `gtr:<normalizedSymbol>:<positionIndex>`.
 *
 * Pipeline (from source/):
 *   node scripts/fetch-szaza-chords.js   # downloads public szaza dataset -> data/
 *   node scripts/add-power-chords.js     # project augmentation
 *   node scripts/add-barre-from-open.js  # project augmentation
 *   node scripts/sync-guitar-chords-json.js
 *
 * Env: GUITAR_CHORDS_JSON overrides the input path (default data/szaza-guitar.json).
 * Skips gracefully when the input is missing (like sync-ukulele-chords-json.js).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SRC = process.env.GUITAR_CHORDS_JSON
  ? path.isAbsolute(process.env.GUITAR_CHORDS_JSON)
    ? process.env.GUITAR_CHORDS_JSON
    : path.join(root, process.env.GUITAR_CHORDS_JSON)
  : path.join(root, 'data', 'szaza-guitar.json');
const DEST_DIR = path.join(root, 'public', 'chords', 'guitar');

// --- verbatim port of seed-chord-library.js transforms ---
const SUFFIX_TO_SYMBOL_PART = {
  major: '', minor: 'm', '7': '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4',
  '7sus4': '7sus4', dim: 'dim', dim7: 'dim7', aug: 'aug', m7b5: 'm7b5', '6': '6', m6: 'm6',
  '9': '9', add9: 'add9', '11': '11', m11: 'm11', '13': '13', maj13: 'maj13', '5': '5',
  mmaj7: 'mmaj7', maj9: 'maj9', m9: 'm9', '7sus2sus4': '7sus2sus4', '7sus4#5': '7sus4#5',
  '9sus4': '9sus4', maj7sus2sus4: 'maj7sus2sus4', maj7sus4: 'maj7sus4',
  'maj7sus4#5': 'maj7sus4#5', sus2sus4: 'sus2sus4', 'sus4#5': 'sus4#5',
};
const BASS_SEGMENT_TO_NOTE = {
  a: 'A', 'a#': 'A#', asharp: 'A#', b: 'B', c: 'C', 'c#': 'C#', csharp: 'C#',
  d: 'D', 'd#': 'D#', dsharp: 'D#', e: 'E', f: 'F', 'f#': 'F#', fsharp: 'F#',
  g: 'G', 'g#': 'G#', gsharp: 'G#',
};
function suffixToSymbolPart(suffix) {
  if (!suffix || typeof suffix !== 'string') return '';
  const base = suffix.split('_')[0];
  const bassSegment = suffix.includes('_') ? suffix.slice(suffix.indexOf('_') + 1).trim() : null;
  const qualityPart = SUFFIX_TO_SYMBOL_PART[base] ?? base;
  if (!bassSegment) return qualityPart;
  const bassNote = BASS_SEGMENT_TO_NOTE[bassSegment.toLowerCase()] ?? bassSegment;
  return qualityPart + '/' + bassNote;
}
function positionToChordData(position) {
  const frets = position.frets;
  const barres = position.barres ?? [];
  const hasBarres = barres.length > 0;
  const positiveFrets = (frets || []).filter((f) => f > 0);
  const minPositive = positiveFrets.length ? Math.min(...positiveFrets) : 1;
  const maxPositive = positiveFrets.length ? Math.max(...positiveFrets) : 1;
  const allWithinFirstThree = minPositive >= 1 && maxPositive <= 3;
  const displayBaseFret =
    !hasBarres && allWithinFirstThree ? 1 : (position.baseFret > 1 ? position.baseFret : minPositive);
  return {
    frets,
    fingers: position.fingers,
    barres: barres.length ? barres : undefined,
    capo: position.capo ?? undefined,
    baseFret: displayBaseFret > 1 ? displayBaseFret : undefined,
  };
}
// --- end port ---

// '#' is a URL fragment marker, so files use the "sharp" spelling (A# -> Asharp.json).
function fileNameForKey(key) {
  return key.replace('#', 'sharp') + '.json';
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.warn('[sync-guitar-chords-json] skip: ' + SRC + ' missing (run fetch-szaza-chords.js first)');
    process.exit(0);
  }
  const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const chords = data.chords || {};
  fs.mkdirSync(DEST_DIR, { recursive: true });

  let definitions = 0;
  let voicings = 0;
  for (const key of Object.keys(chords)) {
    const out = {};
    for (const entry of chords[key]) {
      const { suffix, positions: rawPositions } = entry;
      if (!rawPositions?.length) continue;
      const positions = rawPositions.filter((pos) => {
        const frettedFrets = (pos.frets || []).filter((f) => f >= 0);
        if (frettedFrets.length === 0) return true;
        return Math.min(...frettedFrets) <= 12;
      });
      if (!positions.length) continue;
      const normalizedSymbol = key + suffixToSymbolPart(suffix);
      const list = positions.map((pos, i) => ({
        id: `gtr:${normalizedSymbol}:${i}`,
        name: positions.length > 1 ? `Voicing ${i + 1}` : undefined,
        chord: positionToChordData(pos),
      }));
      out[normalizedSymbol] = (out[normalizedSymbol] || []).concat(list);
      definitions += 1;
      voicings += list.length;
    }
    fs.writeFileSync(path.join(DEST_DIR, fileNameForKey(key)), JSON.stringify(out));
  }
  console.log('[sync-guitar-chords-json] wrote', Object.keys(chords).length, 'key files to public/chords/guitar:',
    definitions, 'definitions,', voicings, 'voicings');
}

main();
