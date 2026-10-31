#!/usr/bin/env node
/**
 * Fetch Salamander Grand Piano samples from Tonejs/audio repo into frontend/public/salamander/.
 * Run from frontend root: node scripts/fetch-salamander-piano.js
 * Requires: network access.
 *
 * Source: https://github.com/Tonejs/audio (Salamander Grand Piano samples)
 * License: See Tonejs/audio repo and salamander/README
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(FRONTEND_ROOT, 'public', 'salamander');
const BASE_URL = 'https://raw.githubusercontent.com/Tonejs/audio/master/salamander/';

// Must match SALAMANDER_SAMPLES.urls in audioEngine.ts
const SAMPLE_FILES = [
  'A0.mp3', 'C1.mp3', 'Ds1.mp3', 'Fs1.mp3', 'A1.mp3',
  'C2.mp3', 'Ds2.mp3', 'Fs2.mp3', 'A2.mp3', 'C3.mp3', 'Ds3.mp3', 'Fs3.mp3', 'A3.mp3',
  'C4.mp3', 'Ds4.mp3', 'Fs4.mp3', 'A4.mp3', 'C5.mp3', 'Ds5.mp3', 'Fs5.mp3', 'A5.mp3',
  'C6.mp3', 'Ds6.mp3', 'Fs6.mp3', 'A6.mp3', 'C7.mp3', 'Ds7.mp3', 'Fs7.mp3', 'A7.mp3',
  'C8.mp3',
];

function fetchToFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        fetchToFile(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`${url} -> ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('Fetching Salamander Grand Piano samples from Tonejs/audio...');
  console.log('  ->', OUTPUT_DIR);
  let ok = 0;
  let fail = 0;
  for (const file of SAMPLE_FILES) {
    const url = BASE_URL + file;
    try {
      const buf = await fetchToFile(url);
      fs.writeFileSync(path.join(OUTPUT_DIR, file), buf);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      fail++;
      console.error('\n  Failed:', file, e.message);
    }
  }
  console.log('\nDone:', ok, 'fetched', fail ? `, ${fail} failed` : '');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
