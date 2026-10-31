# Provenance v2 - local-first slice 1

A self-contained, local-first build of the Provenance song editor. No accounts, no server, no payments: songs live in your browser's localStorage and can be exported/restored as JSON backup files.

## What works in this slice
- Create songs (blank or from a structure template), edit title/lyrics/chords, section structure
- Song list with per-song persistence across reloads (localStorage keys `prov2.*`)
- Record audio ideas against a whole song or a single section (mic via MediaRecorder, or upload MP3/M4A/OGG/WebM), play them back, archive/unarchive, download them
- Audio persists across reloads in IndexedDB (`prov2-audio`); song text stays in localStorage
- Chord Explorer with instrument playback (piano, upright, Rhodes, acoustic guitar samples bundled)
- Export a full backup (all songs + audio, base64-embedded) as a JSON file; restore it later (validated, malformed files are rejected safely; v1 backups without audio still restore)

## Known limitations of this slice (later milestones)
- Guitar chord diagrams are not bundled yet; ukulele diagrams work
- No accounts/sharing: everything stays on this device and browser
- TrackLab multitrack projects, mixdowns, offline sync and Drive integration are later milestones
- Section recordings keep one primary per section; earlier takes are archived (recoverable under Artifacts > show archived)
- Large recordings inflate backup files (audio is base64-embedded, ~33% overhead)

## Build it yourself
Requires Node 20+.

```
npm install
npm run build
```

The static site is emitted to `out/` with basePath `/provenance-v2` (see `next.config.ts`). To serve under a different path, change `basePath` and rebuild.
