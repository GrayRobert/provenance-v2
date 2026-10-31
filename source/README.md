# Provenance v2 - local-first slice 1

A self-contained, local-first build of the Provenance song editor. No accounts, no server, no payments: songs live in your browser's localStorage and can be exported/restored as JSON backup files.

## What works in this slice
- Create songs (blank or from a structure template), edit title/lyrics/chords, section structure
- Song list with per-song persistence across reloads (localStorage keys `prov2.*`)
- Export a full backup (all songs) as a JSON file; restore it later (validated, malformed files are rejected safely)

## Known limitations of this slice (later milestones)
- No audio recording/playback (the Record button shows a notice), no mp3 instrument samples
- Guitar chord diagrams are not bundled yet; ukulele diagrams work
- No accounts/sharing: everything stays on this device and browser
- TrackLab, offline sync and Drive integration are later milestones

## Build it yourself
Requires Node 20+.

```
npm install
npm run build
```

The static site is emitted to `out/` with basePath `/provenance-v2` (see `next.config.ts`). To serve under a different path, change `basePath` and rebuild.
