/**
 * Shared timeline coordinate model for Track Lab.
 *
 * All ruler, waveform, playhead, and grid calculations go through these
 * functions so there is exactly one coordinate system for the entire timeline.
 *
 * The model is pixel-per-second based (like professional DAWs) rather than
 * ratio-based, which eliminates numerical drift at high zoom levels.
 */

export type TimelineTransform = {
  /** Total timeline duration in seconds (always >= MIN_DURATION). */
  duration: number;
  /** Horizontal zoom expressed as CSS pixels per second of audio. */
  pxPerSec: number;
  /** Current horizontal scroll offset of the timeline content in pixels. */
  scrollLeft: number;
  /** Visible width of the timeline viewport in CSS pixels. */
  viewportWidth: number;
};

/** Minimum timeline duration so there's always something to render. */
export const MIN_DURATION = 10;

/** Convert a time (seconds) to a content-space X coordinate. */
export function timeToContentX(t: number, tf: TimelineTransform): number {
  return t * tf.pxPerSec;
}

/** Convert a content-space X coordinate to a viewport-space X coordinate. */
export function contentXToViewportX(x: number, tf: TimelineTransform): number {
  return x - tf.scrollLeft;
}

/** Convert a time (seconds) directly to a viewport-space X coordinate. */
export function timeToViewportX(t: number, tf: TimelineTransform): number {
  return contentXToViewportX(timeToContentX(t, tf), tf);
}

/** Convert a viewport-space X coordinate back to a time (seconds). */
export function viewportXToTime(vx: number, tf: TimelineTransform): number {
  return (vx + tf.scrollLeft) / tf.pxPerSec;
}

/** Convert a content-space X coordinate back to a time (seconds). */
export function contentXToTime(x: number, tf: TimelineTransform): number {
  return x / tf.pxPerSec;
}

/** Total content width in CSS pixels for the current duration and zoom. */
export function getContentWidth(tf: TimelineTransform): number {
  return tf.duration * tf.pxPerSec;
}

/** Choose the ruler tick interval (in seconds) based on pxPerSec. */
export function getRulerInterval(tf: TimelineTransform): number {
  const pxPerTick = tf.pxPerSec; // 1-second worth of pixels
  if (pxPerTick >= 200) return 0.5;
  if (pxPerTick >= 80) return 1;
  if (pxPerTick >= 30) return 2;
  if (pxPerTick >= 12) return 5;
  return 10;
}
