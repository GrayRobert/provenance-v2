# Provenance v2

Local-first songwriting app, built as a static Next.js site. Songs, history and recordings live in the browser: song text and event history in localStorage (`prov2.*`), audio in IndexedDB (`prov2-audio`). There is no hosted account or sync; backups are JSON files the user exports and restores.

## What works

- Song editor: title/lyrics/chords, section structure, templates; per-song persistence across reloads
- Recording: takes against a whole song or a single section (MediaRecorder; format negotiated per browser - WebM where supported, MP4/AAC on iPhone - or upload MP3/M4A/AAC/OGG/WebM), custom take names, playback, rename, archive/unarchive, download from Artifacts
- Track Lab: multitrack recorder with per-track arming, count-in, dB-scaled live input and master meters, latency compensation, and mixdown
- Timeline: per-song event history with hash-chain integrity check, ownership split, and certificate PDF export
- Songwriter Profile: songwriter name, optional legal name and contact/website, per-field switches for what appears on exports; each export embeds a snapshot of the profile at export time; profile is included in backups
- Chord Explorer and Chord Finder with instrument playback (piano, upright, Rhodes, acoustic guitar samples); guitar and ukulele chord diagrams; metronome
- Exports: text, ChordPro, HTML, print view; full JSON backup (audio base64-embedded) with restore validation; v1 backups (no audio) still restore

## Notes and limits

- Section recordings keep one primary take per section; earlier takes are archived (Artifacts > show archived). Takes get automatic versioned names unless named manually
- Large recordings inflate backup files (base64, ~33% overhead)
- Timestamps are device-provided; the history is a local record, not independent proof of authorship or time

## Build

Requires Node 20.9+ (Next.js 16).

```
npm install
npm run build
```

Static output goes to `out/` with basePath `/provenance-v2` (see `next.config.ts`). Tests: `npx vitest run`.
