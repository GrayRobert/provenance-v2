/**
 * Lazily inject the Material Symbols Outlined webfont when the chord explorer
 * (or progression player) actually mounts. Previously this stylesheet was
 * loaded unconditionally from the global root layout, which made it
 * render-blocking on the marketing landing page even though the icons are only
 * used inside the chord-explorer feature.
 *
 * Idempotent: safe to call from multiple components and on every mount.
 */

const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"

let injected = false

export function ensureMaterialSymbolsLoaded(): void {
  if (injected) return
  if (typeof document === "undefined") return

  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-provenance-material-symbols="1"]',
  )
  if (existing) {
    injected = true
    return
  }

  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = MATERIAL_SYMBOLS_HREF
  link.dataset.provenanceMaterialSymbols = "1"
  document.head.appendChild(link)
  injected = true
}
