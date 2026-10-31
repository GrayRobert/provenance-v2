# Provenance

**A local-first songwriting app that keeps a record of how each song was made.**

**Live demo:** https://grayrobert.github.io/provenance-v2/ (runs entirely in the browser - no sign-up, nothing to install)

---

## What it is

Provenance is a web app for writing songs: lyrics, chords, structure, and recordings, all in one place. What makes it different is the history: as you work, the app logs events for the song - lyric and section edits, chord and note changes, recordings - into a hash-chained local record. On the song's timeline page it re-checks that chain and flags the history if the stored events no longer match it. A printable Song History certificate exports the record as a PDF.

## How it was built

I haven't written a single line of this project's code by hand. As a product designer, engineer and manager, I've fully embraced AI-first programming. Provenance is a project I've developed through that approach, not a claim of hand-written implementation.

The original hosted version was developed using an agentic pipeline of Cursor, GitHub and Linear for project and feature tickets, with Vercel v0 for some UI components.

Version 2 ports the app to a local, client-side model so the project can continue without ongoing backend hosting. That port was completed in a few hours through a conversation with [Instinct](https://instinct.com/). 🤯

## Screenshots

![Song editor with lyrics, chords and section structure](https://github.com/user-attachments/assets/ec523241-4280-4db9-a8e9-9db800b810a2)
**Song editor** - lyrics, chords, and section structure in one workspace

![Track Lab with a recorded take](https://github.com/user-attachments/assets/70d7fbf3-1026-48ff-8851-010550041fdc)
**Track Lab** - multitrack recording with per-track arming, count-in, live input meters, latency compensation, and mixdown

![Song history timeline with integrity check](https://github.com/user-attachments/assets/7a1fd137-50ab-43ac-a449-1f8ffe10be96)
**Timeline** - per-song event history with the on-device hash-chain check and evidence coverage per element

![Chord Explorer](https://github.com/user-attachments/assets/be198f76-34b8-45f9-935b-85a3f3f78206)
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

The song history is a proof of concept. Its hash-chained record lives entirely in browser storage. It can flag mismatches, but someone with access to that storage can rewrite both the events and the chain, so it isn't tamper-proof. Device timestamps and self-supplied author details aren't independent proof of authorship or time, or copyright registration.

The original hosted app implemented RFC 3161 timestamping, allowing certificate snapshots to receive a signed timestamp from an external authority. The longer-term goal was immutable Web3 storage as an optional paid feature. Neither is included in this local version. Provenance doesn't depend on them: its first job is to inspire songwriters and help them turn ideas into songs. The history supports the writing, not the other way around.

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
