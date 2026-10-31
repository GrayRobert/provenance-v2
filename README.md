# Provenance

**A local-first songwriting app that keeps a record of how each song was made.**

**Live demo:** https://grayrobert.github.io/provenance-v2/ (runs entirely in the browser - no sign-up, nothing to install)

---

## What it is

Provenance is a web app for writing songs: lyrics, chords, structure, and recordings, all in one place. What makes it different is the history: as you work, the app logs events for the song - lyric and section edits, chord and note changes, recordings - into a hash-chained local record. On the song's timeline page it re-checks that chain and flags the history if the stored events no longer match it. A printable Song History certificate exports the record as a PDF.

## Screenshots

![Song editor with lyrics, chords and section structure](docs/screenshots/editor.png)
**Song editor** - lyrics, chords, and section structure in one workspace

![Track Lab with a recorded take](docs/screenshots/tracklab.png)
**Track Lab** - multitrack recording with per-track arming, count-in, live input meters, latency compensation, and mixdown

![Song history timeline with integrity check](docs/screenshots/timeline.png)
**Timeline** - per-song event history with the on-device hash-chain check and evidence coverage per element

![Chord Explorer](docs/screenshots/chord-explorer.png)
**Chord Explorer** - keyboard and diatonic chord pads with instrument playback

## Features

- **Song editor** - lyrics, chords, and section structure, with genre-based templates to start from.
- **Chords** - chord diagrams for guitar and ukulele, a chord explorer and chord finder, with instrument playback and a metronome.
- **Recording** - record takes against a whole song or a single section; name, play back, archive, and restore them.
- **Track Lab** - a multitrack recorder and mixer: per-track arming, count-in, live input meters, latency compensation, and mixdown.
- **Song history** - a per-song event history with an on-device hash-chain check that flags when the stored history doesn't match its chain, an ownership split, and a printable certificate PDF.
- **Songwriter Profile** - your songwriter name and optional details; you choose which appear on exports. Each export keeps its own snapshot, so editing the profile later never rewrites an export you already made.
- **Exports and backups** - songs as text, ChordPro, HTML, or print view; full backups (songs, history, recordings, profile) as one JSON file, with restore.

## Your data

Song text, history, and recordings are stored on your device: text and history in localStorage, audio in IndexedDB. There is no hosted song account and no sync service. Exports, certificates, and backups are files you choose to save or share - use Export backup on the songs page to keep your own copy.

## What the history is (and isn't)

Timestamps come from the device clock, and profile details on exports are supplied by the songwriter. The hash-chain check runs on your own device and tells you whether the stored history still matches its chain - it can flag tampering or corruption of that local record, but it is not independent proof of authorship or time, and it is not copyright registration.

## Tech

- **Next.js 16 + React 19 + TypeScript**, statically exported and hosted on GitHub Pages
- **Tailwind CSS**, Radix UI, Zustand
- **Web Audio API + Tone.js** for recording, metering, playback, and instrument sounds
- **@tombatossals/chords-db** chord library with local guitar voicings
- **@react-pdf/renderer** for the certificate PDF
- Local persistence: localStorage (songs, history, profile) + IndexedDB (audio)
- Tests with Vitest + Testing Library

## Run it locally

Requires Node 20.9 or newer (Next.js 16).

```
cd source
npm install
npm run build
```

The static site is emitted to `source/out/` with basePath `/provenance-v2` (see `source/next.config.ts`).

## Status

Public preview.
