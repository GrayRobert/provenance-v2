
/**
 * Build frontend/lib/szaza-guitar.json from the szaza guitar-chords-db-json repo.
 * Clones the repo once, converts all chord JSONs from disk, then removes the clone.
 *
 * Recommended run order (from repo root):
 *   1. node scripts/fetch-szaza-chords.js
 *   2. node scripts/add-power-chords.js
 *   3. node scripts/add-barre-from-open.js
 *   4. (optional) node scripts/validate-chord-coverage.js
 *   5. Re-seed DB: clear chord tables, then node scripts/seed-chord-library.js
 *
 * Requires: git, network (for clone).
 * Commit the generated file so the repo has chord data and /chords works without re-running.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'data', 'szaza-guitar.json');
const CLONE_DIR = path.join(__dirname, '.szaza-chords-repo');
const REPO_URL = 'https://github.com/szaza/guitar-chords-db-json.git';

const ROOTS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];

function parseSzazaFretChar(c) {
  if (c === 'x' || c === 'X') return -1;
  const n = parseInt(c, 10);
  if (!Number.isNaN(n)) return n;
  const code = c.toLowerCase().charCodeAt(0);
  if (code >= 97 && code <= 122) return code - 97 + 10;
  return -1;
}

function szazaPositionToOurFormat(p) {
  const frets = p.frets.split('').map(parseSzazaFretChar);
  if (frets.length !== 6) return null;
  const positive = frets.filter((n) => n > 0);
  const baseFret = positive.length ? Math.min(...positive) : 1;
  const fingers = p.fingers?.split('').map((c) => parseInt(c, 10)).filter((n) => !Number.isNaN(n));
  const barres = [];
  if (p.barres) {
    const b = parseInt(p.barres, 10);
    if (!Number.isNaN(b) && b > 0) barres.push(b);
  }
  return {
    frets,
    fingers: fingers?.length === 6 ? fingers : undefined,
    baseFret,
    barres,
    capo: p.capo === 'true',
    _source: 'szaza',
  };
}

function main() {
  if (fs.existsSync(CLONE_DIR)) {
    console.log('Removing existing clone...');
    fs.rmSync(CLONE_DIR, { recursive: true });
  }

  console.log('Cloning repo (shallow)...');
  execSync(`git clone --depth 1 ${REPO_URL} "${CLONE_DIR}"`, {
    cwd: __dirname,
    stdio: 'inherit',
  });

  const chords = {};
  const keysSet = new Set();
  const suffixesSet = new Set();
  let done = 0;
  const failedParseList = [];
  const failedNoPositionsList = [];

  for (const key of ROOTS) {
    const keyDir = path.join(CLONE_DIR, key);
    if (!fs.existsSync(keyDir) || !fs.statSync(keyDir).isDirectory()) continue;
    const files = fs.readdirSync(keyDir).filter((f) => f.endsWith('.json'));
    for (const filename of files) {
      const suffix = filename.replace(/\.json$/, '');
      const filePath = path.join(keyDir, filename);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const file = JSON.parse(raw);
        const positions = (file.positions || [])
          .map(szazaPositionToOurFormat)
          .filter(Boolean);
        if (!positions.length) {
          failedNoPositionsList.push(`${key}/${filename}`);
          continue;
        }
        if (!chords[key]) chords[key] = [];
        chords[key].push({ key, suffix, positions });
        keysSet.add(key);
        suffixesSet.add(suffix);
        done++;
        if (done % 100 === 0) console.log(`  ${done} files...`);
      } catch (e) {
        failedParseList.push({ key: `${key}/${filename}`, message: e.message });
      }
    }
  }
  const failedParse = failedParseList.length;
  const failedNoPositions = failedNoPositionsList.length;
  const failed = failedParse + failedNoPositions;

  console.log('Removing clone...');
  fs.rmSync(CLONE_DIR, { recursive: true });

  const output = {
    chords,
    tunings: { standard: ['E', 'A', 'D', 'G', 'B', 'E'] },
    keys: [...keysSet].sort(),
    suffixes: [...suffixesSet].sort(),
  };
  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', OUTPUT_PATH);
  console.log('Done:', done, 'chord files,', failed, 'failed', failed ? `(${failedParse} parse/error, ${failedNoPositions} no valid 6-string positions)` : '');
  if (failedParseList.length) {
    console.log('\nFailed (parse/error):');
    failedParseList.forEach(({ key, message }) => console.log(`  ${key}: ${message}`));
  }
  if (failedNoPositionsList.length) {
    console.log('\nFailed (no valid 6-string positions):');
    failedNoPositionsList.sort().forEach((entry) => console.log(`  ${entry}`));
  }
}

main();
