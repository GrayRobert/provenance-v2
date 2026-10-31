/**
 * Copy ukulele chord shapes from @tombatossals/chords-db into public/ so the app
 * can fetch them at runtime instead of bundling ~210KiB as a webpack module (avoids
 * PackFileCacheStrategy "serializing big strings" dev warnings).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(
  root,
  'node_modules/@tombatossals/chords-db/lib/ukulele.json'
);
const dest = path.join(root, 'public/chords/ukulele.json');

if (!fs.existsSync(src)) {
  console.warn(
    '[sync-ukulele-chords-json] skip: node_modules not installed or chords-db missing'
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[sync-ukulele-chords-json] copied to public/chords/ukulele.json');
