#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Optimise marketing PNGs in `public/images/` for the landing page.
 *
 * - Source images today range from ~280 KB (logo) to ~1.5 MB (app-timeline.png 6016x6684).
 *   The showcase shots (chord-explorer, track-lab, songwriting-interface) are 4112x~2300
 *   PNGs around 600-950 KB. They are displayed at <= ~1100 px wide on desktop, so the
 *   originals are wildly oversized.
 * - This script downscales each marketing PNG to a sensible max width and re-encodes it
 *   with `sharp` (palette quantisation + max compression). The output files keep the
 *   same filename so existing references in code keep working. `next/image` then handles
 *   AVIF/WebP conversion and responsive `srcset` at request time.
 * - Run from `frontend/`:
 *     node scripts/optimize-marketing-images.js
 *
 * Files not listed below are left untouched (e.g. `logo.png`, `chain-integrity.png`).
 */

const path = require("node:path")
const fs = require("node:fs/promises")
const sharp = require("sharp")

const ROOT = path.resolve(__dirname, "..")
const IMAGES_DIR = path.join(ROOT, "public/images")

/** width = max output width in px (height auto). PNGs only. */
const TARGETS = [
  { file: "chord-explorer.png", width: 1920 },
  { file: "track-lab.png", width: 1920 },
  { file: "songwriting-interface.png", width: 1920 },
  { file: "event-timeline.png", width: 1280 },
  { file: "certificate-metadata.png", width: 1280 },
  { file: "certificate-preview.png", width: 1024 },
  { file: "crypto-summary.png", width: 1920 },
  { file: "mobile-light-theme.png", width: 800 },
  { file: "mobile-dark-theme.png", width: 800 },
  { file: "app-timeline.png", width: 1920 },
  { file: "login-screen.png", width: 1024 },
]

async function processOne({ file, width }) {
  const filePath = path.join(IMAGES_DIR, file)
  const before = await fs.stat(filePath).catch(() => null)
  if (!before) {
    console.warn(`skip (missing): ${file}`)
    return
  }
  const meta = await sharp(filePath).metadata()
  const targetWidth = Math.min(width, meta.width ?? width)
  const buf = await sharp(filePath)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer()
  await fs.writeFile(filePath, buf)
  const after = await fs.stat(filePath)
  const beforeKb = (before.size / 1024).toFixed(0)
  const afterKb = (after.size / 1024).toFixed(0)
  const dims = `${meta.width}x${meta.height} -> ${targetWidth}px wide`
  console.log(`${file.padEnd(32)} ${dims.padEnd(28)} ${beforeKb} KB -> ${afterKb} KB`)
}

;(async () => {
  for (const t of TARGETS) {
    await processOne(t)
  }
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
