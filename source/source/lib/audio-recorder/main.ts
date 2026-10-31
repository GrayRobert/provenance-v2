/**
 * Vanilla audio recorder: full v0 (Track Lab) design.
 * Mount into container, build DOM to match transport bar, timeline ruler, track strips, waveform canvas, master section.
 */

import { createAudioEngine, extractWaveformRange, getPyramidPeaks } from './audioEngine';
import {
  barBeatToSeconds,
  getGridLines,
  getRulerTicks,
  secondsToBarBeat,
  snapTimeToGrid,
  type SnapSetting,
} from './musicalTime';
import type {
  AudioRecorderInstance,
  AudioRecorderProps,
  InputMonitoringMode,
  TrackLabProjectData,
} from './types';
import type { TrackState } from './types';
import {
  type TimelineTransform,
  MIN_DURATION,
  timeToContentX,
  timeToViewportX,
  viewportXToTime,
  getContentWidth,
  getRulerInterval,
} from './timelineTransform';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/** Darken a #rrggbb hex for fade line (darker shade of waveform colour). */
function darkenHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

const LEVEL_METER_SEGMENTS = 20;

/** Pixels from the left of the timeline viewport to place the playhead after a page; accounts for left-side controls that mask the first bit. */
const AUTOSCROLL_LEFT_OFFSET_PX = 12;

/** Timeout for getUserMedia + enumerateDevices in the settings modal; avoids hanging when the OS is slow (e.g. remote/iPhone devices). */
const DEVICE_LOAD_TIMEOUT_MS = 10_000;

function buildLevelMeterSegments(level: number, segments = LEVEL_METER_SEGMENTS): string {
  const active = Math.round(level * segments);
  let html = '';
  for (let i = 0; i < segments; i++) {
    const ratio = i / segments;
    let color = 'bg-secondary';
    if (i < active) {
      color = ratio > 0.85 ? 'bg-[var(--meter-red)]' : ratio > 0.65 ? 'bg-[var(--meter-yellow)]' : 'bg-[var(--meter-green)]';
    }
    html += `<div class="flex-1 h-2 rounded-sm transition-colors duration-75 ${color}" data-segment="${i}"></div>`;
  }
  return html;
}

function buildLedGridMeter(container: HTMLElement, segmentCount: number): void {
  container.classList.add('ar-led-grid');
  container.innerHTML = '';
  for (let i = 0; i < segmentCount; i++) {
    const seg = document.createElement('div');
    seg.className = 'ar-led-seg';
    seg.dataset.segIndex = String(i);
    container.appendChild(seg);
  }
}

function updateLedGridMeter(container: HTMLElement, level: number, segmentCount: number): void {
  const active = Math.round(level * segmentCount);
  const segs = container.querySelectorAll('.ar-led-seg');
  for (let i = 0; i < segs.length; i++) {
    const el = segs[i] as HTMLElement;
    const ratio = i / segmentCount;
    if (i < active) {
      const color = ratio > 0.85 ? 'var(--meter-red)' : ratio > 0.65 ? 'var(--meter-yellow)' : 'var(--meter-green)';
      el.style.backgroundColor = color;
      el.classList.add('ar-led-seg--on');
    } else {
      el.style.backgroundColor = '';
      el.classList.remove('ar-led-seg--on');
    }
  }
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  _wrapEl: HTMLDivElement,
  track: TrackState,
  displayTime: number,
  startPosition: number,
  isPlaying: boolean,
  recordingElapsed: number,
  height: number,
  tf: TimelineTransform,
  /** Playhead line color (e.g. from --foreground) so it's visible in both light and dark mode. */
  playheadColor: string = '#1a1a1a',
  gridContext?: { tempo: number; timeSignature: [number, number]; snapSetting: SnapSetting }
) {
  const dpr = window.devicePixelRatio || 1;
  const w = tf.viewportWidth;
  const scroll = tf.scrollLeft;
  canvas.width = w * dpr;
  canvas.height = height * dpr;
  /* Display at 1:1 so playhead and waveform align with ruler (no stretch; zoom = redraw) */
  canvas.style.width = `${w}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, height);

  const toCanvas = (contentX: number) => contentX - scroll;

  /* Grid colors: subtle in light theme so waveform stays visible; current values for dark. */
  const isLight =
    canvas.closest('[data-theme]')?.getAttribute('data-theme') !== 'dark';
  const gridBar = isLight ? 'hsl(220, 8%, 82%)' : 'hsl(220, 6%, 40%)';
  const gridBeat = isLight ? 'hsl(220, 8%, 88%)' : 'hsl(220, 6%, 35%)';
  const gridFallback = isLight ? 'hsl(220, 8%, 86%)' : 'hsl(220, 6%, 38%)';
  const gridCenter = isLight ? 'hsl(220, 8%, 80%)' : 'hsl(220, 6%, 42%)';

  if (gridContext && gridContext.tempo > 0 && gridContext.timeSignature[0] >= 1 && gridContext.timeSignature[1] >= 1) {
    const gridLines = getGridLines(tf, gridContext.tempo, gridContext.timeSignature, gridContext.snapSetting);
    for (const line of gridLines) {
      const viewportX = timeToViewportX(line.positionSeconds, tf);
      if (viewportX < -1 || viewportX > w + 1) continue;
      /* Same coordinate as ruler: viewport X, rounded so grid and ruler align on the same pixel */
      const x = Math.round(viewportX) + 0.5;
      ctx.strokeStyle = line.isBar ? gridBar : gridBeat;
      ctx.lineWidth = line.isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = gridFallback;
    ctx.lineWidth = 0.5;
    const interval = getRulerInterval(tf);
    for (let t = interval; t < tf.duration; t += interval) {
      const viewportX = timeToViewportX(t, tf);
      if (viewportX < -1 || viewportX > w + 1) continue;
      const x = Math.round(viewportX) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = gridCenter;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(w, height / 2);
  ctx.stroke();

  if (track.isRecording) {
    const startX = timeToContentX(startPosition, tf);
    const elapsedWidth = recordingElapsed * tf.pxPerSec;
    const regionEnd = startX + elapsedWidth;
    const visLeft = scroll;
    const visRight = scroll + w;
    const drawLeft = Math.max(startX, visLeft);
    const drawRight = Math.min(regionEnd, visRight);
    if (drawRight > drawLeft) {
      ctx.fillStyle = track.color + '18';
      ctx.fillRect(toCanvas(drawLeft), 0, drawRight - drawLeft, height);
    }
    if (regionEnd > visLeft && regionEnd <= visRight) {
      ctx.fillStyle = track.color + '66';
      ctx.fillRect(toCanvas(regionEnd) - 1.5, 0, 3, height);
      ctx.strokeStyle = track.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(toCanvas(regionEnd), 0);
      ctx.lineTo(toCanvas(regionEnd), height);
      ctx.stroke();
    }
  } else if (track.regions.length > 0) {
    const centerY = height / 2;
    const amplitudeScale = centerY * 0.92;
    const playheadCX = timeToContentX(displayTime, tf);
    const playheadCanvasX = toCanvas(playheadCX);
    const showPlayhead = (isPlaying || displayTime >= 0) && playheadCX >= scroll && playheadCX <= scroll + w;
    const visLeft = scroll;
    const visRight = scroll + w;
    const REGION_GAP_PX = 1;

    for (let i = 0; i < track.regions.length; i++) {
      const region = track.regions[i];
      const regionStart = region.startTime;
      const regionEnd = region.startTime + region.duration;
      const regionStartX = regionStart * tf.pxPerSec;
      const regionEndX = regionEnd * tf.pxPerSec;
      if (regionEndX < visLeft || regionStartX > visRight) continue;

      const leftInset = i > 0 ? REGION_GAP_PX : 0;
      const rightInset = i < track.regions.length - 1 ? REGION_GAP_PX : 0;
      const drawLeft = Math.max(0, toCanvas(regionStartX) + leftInset);
      const drawRight = Math.min(w, toCanvas(regionEndX) - rightInset);
      const rightHandleCanvasX = toCanvas(regionEndX) - rightInset;
      const drawW = drawRight - drawLeft;
      if (drawW <= 0) continue;

      ctx.save();
      ctx.beginPath();
      ctx.rect(drawLeft, 0, drawW, height);
      ctx.clip();

      ctx.fillStyle = track.color + '22';
      ctx.fillRect(drawLeft, 0, drawW, height);

      const pyramid = region.waveformPyramid;
      const sr = pyramid ? pyramid.sampleRate : region.audioBuffer.sampleRate;
      const cols = Math.ceil(drawW);
      for (let px = 0; px < cols; px++) {
        const contentX = drawLeft + px + scroll;
        const t0 = contentX / tf.pxPerSec;
        const t1 = (contentX + 1) / tf.pxPerSec;
        const t0InRegion = Math.max(0, Math.min(region.duration, t0 - regionStart));
        const t1InRegion = Math.max(0, Math.min(region.duration, t1 - regionStart));
        const bufT0 = region.sourceOffset + t0InRegion;
        const bufT1 = region.sourceOffset + t1InRegion;
        if (bufT1 <= bufT0) continue;
        let mn = 0;
        let mx = 0;
        if (pyramid) {
          const s0 = Math.floor(bufT0 * sr);
          const s1 = Math.ceil(bufT1 * sr);
          if (s1 > s0) {
            const peaks = getPyramidPeaks(pyramid, s0, s1);
            mn = peaks.min;
            mx = peaks.max;
          }
        } else {
          const range = extractWaveformRange(region.audioBuffer, bufT0, bufT1, 1);
          if (range.length > 0) {
            mx = range[0];
            mn = -range[0];
          }
        }
        const yTop = centerY - mx * amplitudeScale;
        const yBot = centerY - mn * amplitudeScale;
        const colHeight = Math.max(1, yBot - yTop);
        const isPastPlayhead = showPlayhead && drawLeft + px < playheadCanvasX;
        ctx.fillStyle = isPastPlayhead ? track.color : track.color + 'cc';
        if (region.muted) ctx.globalAlpha = 0.5;
        ctx.fillRect(drawLeft + px, yTop, 1, colHeight);
        ctx.globalAlpha = 1;
      }

      const FADE_HANDLE_PX = 14;
      if (region.fadeInSeconds > 0 || region.fadeOutSeconds > 0) {
        const fadeInX = region.startTime + region.fadeInSeconds;
        const fadeOutX = region.startTime + region.duration - region.fadeOutSeconds;
        const fadeInCanvasX = toCanvas(fadeInX * tf.pxPerSec);
        const fadeOutCanvasX = toCanvas(fadeOutX * tf.pxPerSec);
        const fadeFillColor = 'rgba(0,0,0,0.22)';
        const fadeLineColor = darkenHex(track.color, 0.5);

        if (region.fadeInSeconds > 0 && fadeInCanvasX > drawLeft) {
          const fadeW = Math.min(drawW, fadeInCanvasX - drawLeft);
          ctx.beginPath();
          ctx.moveTo(drawLeft, height);
          ctx.lineTo(drawLeft + fadeW, height);
          ctx.lineTo(drawLeft + fadeW, 0);
          ctx.closePath();
          ctx.fillStyle = fadeFillColor;
          ctx.fill();
          ctx.strokeStyle = fadeLineColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(drawLeft, height);
          ctx.lineTo(drawLeft + fadeW, 0);
          ctx.stroke();
        }
        if (region.fadeOutSeconds > 0 && fadeOutCanvasX < drawRight) {
          const fadeW = Math.min(drawW, drawRight - fadeOutCanvasX);
          const fx0 = drawRight - fadeW;
          ctx.beginPath();
          ctx.moveTo(fx0, 0);
          ctx.lineTo(drawRight, 0);
          ctx.lineTo(drawRight, height);
          ctx.closePath();
          ctx.fillStyle = fadeFillColor;
          ctx.fill();
          ctx.strokeStyle = fadeLineColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(fx0, 0);
          ctx.lineTo(drawRight, height);
          ctx.stroke();
        }
      }
      ctx.fillStyle = track.color;
      ctx.strokeStyle = track.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(drawLeft, 0);
      ctx.lineTo(drawLeft + FADE_HANDLE_PX, 0);
      ctx.lineTo(drawLeft, FADE_HANDLE_PX);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      /* Right-hand triangle and trim rect: at region end in canvas space; draw when on-screen (tolerance for float/grid) */
      const TRIM_RECT_SIZE = 14;
      const rightHandleVisible = rightHandleCanvasX > -1 && rightHandleCanvasX < w + 1;
      if (rightHandleVisible) {
        const x = Math.max(0, Math.min(w, Math.round(rightHandleCanvasX)));
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - FADE_HANDLE_PX, 0);
        ctx.lineTo(x, FADE_HANDLE_PX);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(x - TRIM_RECT_SIZE, height - TRIM_RECT_SIZE, TRIM_RECT_SIZE, TRIM_RECT_SIZE);
        ctx.strokeRect(x - TRIM_RECT_SIZE, height - TRIM_RECT_SIZE, TRIM_RECT_SIZE, TRIM_RECT_SIZE);
      }
      ctx.fillRect(drawLeft, height - TRIM_RECT_SIZE, TRIM_RECT_SIZE, TRIM_RECT_SIZE);
      ctx.strokeRect(drawLeft, height - TRIM_RECT_SIZE, TRIM_RECT_SIZE, TRIM_RECT_SIZE);
      ctx.restore();
      /* Border around region in track primary colour; inset by half lineWidth so bottom stroke is not clipped */
      ctx.save();
      ctx.strokeStyle = track.color;
      ctx.lineWidth = 2;
      const half = 1;
      ctx.beginPath();
      ctx.rect(drawLeft + half, half, drawW - half * 2, height - half * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* Playhead line -- no premature rounding; canvas handles sub-pixel */
  const phCX = timeToContentX(displayTime, tf);
  if (!track.isRecording && (isPlaying || displayTime >= 0) && tf.duration > 0 && phCX >= scroll && phCX < scroll + w) {
    ctx.strokeStyle = playheadColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toCanvas(phCX), 0);
    ctx.lineTo(toCanvas(phCX), height);
    ctx.stroke();
  }
  /* Start position marker */
  const markerCX = timeToContentX(startPosition, tf);
  const playheadAndMarkerSame = Math.abs(markerCX - phCX) < 1;
  if (
    !track.isRecording &&
    !isPlaying &&
    startPosition > 0 &&
    tf.duration > 0 &&
    !playheadAndMarkerSame &&
    markerCX >= scroll &&
    markerCX < scroll + w
  ) {
    ctx.strokeStyle = track.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(toCanvas(markerCX), 0);
    ctx.lineTo(toCanvas(markerCX), height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// #region agent log
function _dbg(elapsedMs: number, phase: string, hypothesisId?: string) {
  fetch('http://127.0.0.1:7242/ingest/6f1afb82-63b3-4168-adb3-f475d3535a19', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6361cc' },
    body: JSON.stringify({
      sessionId: '6361cc',
      location: 'main.ts:settings-modal',
      message: phase,
      data: { elapsedMs, phase },
      hypothesisId: hypothesisId ?? 'timing',
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

let armNoticeTimer: ReturnType<typeof setTimeout> | null = null;
let armNoticeEl: HTMLElement | null = null;

function showArmTrackNotice(): void {
  if (!armNoticeEl) {
    armNoticeEl = document.createElement('div');
    armNoticeEl.id = 'ar-arm-notice';
    armNoticeEl.className = 'fixed left-1/2 bottom-28 z-[70] -translate-x-1/2 rounded border border-border bg-secondary px-3 py-2 text-xs text-foreground shadow-lg transition-opacity duration-300';
    document.body.appendChild(armNoticeEl);
  }
  armNoticeEl.textContent = 'Arm a track to record first: tap the red dot on a track.';
  armNoticeEl.style.opacity = '1';
  if (armNoticeTimer) clearTimeout(armNoticeTimer);
  armNoticeTimer = setTimeout(() => {
    if (armNoticeEl) armNoticeEl.style.opacity = '0';
  }, 3500);
}

export function mountAudioRecorder(
  container: HTMLElement,
  props: AudioRecorderProps
): AudioRecorderInstance {
  const engine = createAudioEngine();
  let currentProps = props;
  const cleanupFns: (() => void)[] = [];
  container.innerHTML = '';
  container.className = 'flex flex-col flex-1 min-h-0 overflow-hidden bg-background text-foreground select-none audio-recorder-container relative';

  /* ----- Header (Track Lab, v1.02) + Save, Close ----- */
  const header = document.createElement('header');
  header.className = 'flex items-center justify-between border-b border-border bg-card px-4 py-2 shrink-0';
  header.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <div class="h-6 w-6 rounded bg-accent flex items-center justify-center text-foreground">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
        </div>
        <h1 class="text-sm font-semibold text-foreground tracking-tight">Track Lab</h1>
      </div>
      <span class="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">v1.02</span>
    </div>
    <div class="flex items-center gap-2">
      <button type="button" id="ar-undo" class="ar-undo-redo-btn p-1 rounded disabled:pointer-events-none hover:opacity-90" title="Undo (Ctrl+Z)" aria-label="Undo">
        <svg id="ar-undo-icon" class="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
      </button>
      <button type="button" id="ar-redo" class="ar-undo-redo-btn p-1 rounded disabled:pointer-events-none hover:opacity-90" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
        <svg id="ar-redo-icon" class="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>
      </button>
      <button type="button" id="ar-save" class="flex items-center gap-1.5 text-xs text-foreground bg-secondary hover:bg-border px-2 py-1.5 sm:px-3 rounded transition-colors font-medium" title="Save" aria-label="Save">
        <svg class="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
        <span class="hidden sm:inline">Save</span>
      </button>
      <button type="button" id="ar-mixdown" class="flex items-center gap-1.5 text-xs text-foreground bg-secondary hover:bg-border px-2 py-1.5 sm:px-3 rounded transition-colors font-medium" title="Mix down" aria-label="Mix down">
        <svg class="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>
        <span id="ar-mixdown-label" class="hidden sm:inline">Mix down</span>
      </button>
      <button type="button" id="ar-close" class="p-1.5 rounded text-muted-foreground hover:text-foreground" title="Close" aria-label="Close">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
  container.appendChild(header);

  /* ----- Transport bar (v0: BPM, metronome, count-in, skip back, play, record, loop, count-in dots, time) ----- */
  const transport = document.createElement('div');
  transport.className = 'ar-transport-bar flex items-center justify-between border-b border-border bg-card px-4 py-2 shrink-0';
  transport.innerHTML = `
    <div class="ar-transport-tempo flex items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="font-mono text-muted-foreground uppercase tracking-wider" style="font-size: 0.675rem">BPM</span>
        <input type="number" id="ar-tempo" min="40" max="300" value="120" class="w-16 bg-secondary border border-border rounded px-2 py-1 text-sm font-mono text-foreground text-center focus:outline-none focus:ring-1 focus:ring-accent" />
      </div>
      <div class="h-6 w-px bg-border"></div>
      <div class="flex items-center gap-1.5">
        <span class="font-mono text-muted-foreground uppercase tracking-wider" style="font-size: 0.675rem">Sig</span>
        <button type="button" id="ar-time-sig-num" class="w-9 bg-secondary border border-border rounded px-1 py-1 font-mono text-foreground text-center focus:outline-none focus:ring-1 focus:ring-accent hover:bg-secondary/80 cursor-pointer" style="font-size: 0.675rem" title="Time signature numerator (click to cycle 1–12)" aria-label="Time signature numerator">4</button>
        <span class="font-mono text-muted-foreground" style="font-size: 0.675rem">/</span>
        <button type="button" id="ar-time-sig-den" class="w-9 bg-secondary border border-border rounded px-1 py-1 font-mono text-foreground text-center focus:outline-none focus:ring-1 focus:ring-accent hover:bg-secondary/80 cursor-pointer" style="font-size: 0.675rem" title="Time signature denominator (click to cycle 1–12)" aria-label="Time signature denominator">4</button>
      </div>
      <div class="h-6 w-px bg-border"></div>
      <button type="button" id="ar-metronome" class="ar-console-btn h-8 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Metronome">
        <svg class="ar-metronome-icon" viewBox="0 0 24 24"><path d="M12 2L6 22h12L12 2Z"/><path d="M12 12l4-6"/></svg>
      </button>
      <button type="button" id="ar-countin" class="ar-console-btn h-8 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Count-In (4 beats)">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button type="button" class="ar-btn-settings ar-console-btn h-8 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Settings">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </div>
    <div class="ar-transport-controls flex items-center gap-2">
      <button type="button" id="ar-skipback" class="ar-console-btn h-10 w-10 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Return to Start">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 17 6 12 11 7 11 17"/><polygon points="18 17 13 12 18 7 18 17"/></svg>
      </button>
      <button type="button" id="ar-play" class="ar-console-btn h-10 w-10 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Play">
        <svg id="ar-play-icon" class="h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>
      <button type="button" id="ar-stop" class="ar-console-btn h-10 w-10 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Stop">
        <svg class="h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
      </button>
      <button type="button" id="ar-record" class="ar-console-btn h-10 w-10 rounded-full flex items-center justify-center ar-record-btn text-destructive bg-destructive/10" title="Record">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
      </button>
      <button type="button" id="ar-loop" class="ar-console-btn h-10 w-10 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Loop">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      </button>
    </div>
    <div class="ar-transport-time flex flex-wrap items-center gap-4">
      <div class="flex items-center gap-1.5 shrink-0">
        <label for="ar-snap" class="font-mono text-muted-foreground whitespace-nowrap" style="font-size: 0.675rem" title="Grid snap">Snap</label>
        <select id="ar-snap" class="bg-secondary border border-border rounded px-1.5 py-0.5 text-[10px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent" title="Grid and snap setting" aria-label="Snap setting">
          <option value="Smart" selected>Smart</option>
          <option value="Bar">Bar</option>
          <option value="1/2">1/2</option>
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/8T">1/8T</option>
          <option value="1/16">1/16</option>
          <option value="1/16T">1/16T</option>
          <option value="1/32">1/32</option>
          <option value="1/32T">1/32T</option>
          <option value="1/64">1/64</option>
          <option value="1/128">1/128</option>
          <option value="Off">Off</option>
        </select>
      </div>
      <div class="ar-touch-mode-toggle flex items-center gap-1.5 shrink-0">
        <button type="button" id="ar-touch-mode-btn" class="ar-console-btn h-8 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground" title="Scroll timeline (tap to switch to Edit)" aria-label="Touch mode: Scroll (tap to switch to Edit)">
          <svg class="ar-touch-mode-icon-hand h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a4 4 0 0 1-4 4h-2"/></svg>
          <svg class="ar-touch-mode-icon-cursor h-4 w-4 pointer-events-none hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-5.39 5.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
        </button>
      </div>
      <div id="ar-countin-dots" class="flex items-center gap-1 hidden"></div>
      <div class="bg-secondary rounded-md px-4 py-1.5 min-w-[160px] text-center flex flex-col gap-0.5">
        <div>
          <span id="ar-time" class="font-mono text-lg tracking-wider text-foreground">0:00.00</span>
          <span class="font-mono text-xs text-muted-foreground ml-2">/ <span id="ar-duration">0:00.00</span></span>
        </div>
        <div class="font-mono text-[10px] text-muted-foreground">
          <span id="ar-barbeat" aria-label="Bar and beat">1.1</span>
          <span class="ml-1">/ <span id="ar-duration-barbeat">1.1</span></span>
        </div>
      </div>
    </div>
  `;
  container.appendChild(transport);

  /* ----- Timeline + Tracks: vertical scroll in main area; horizontal scrollbar in sticky strip so it's always visible ----- */
  const PX_PER_SEC_MIN = 20;
  const PX_PER_SEC_MAX = 2000;
  const HEIGHT_MIN = 180;
  const HEIGHT_MAX = 900;
  const timelineTracksWrap = document.createElement('div');
  timelineTracksWrap.className = 'ar-timeline-tracks-wrap flex flex-col flex-1 min-h-0 overflow-hidden';
  const scrollContainer = document.createElement('div');
  scrollContainer.className = 'ar-tracks-timeline-scroll flex-1 min-w-0 min-h-0 overflow-auto bg-background';
  scrollContainer.id = 'ar-timeline-scroll';
  const timelineContent = document.createElement('div');
  timelineContent.className = 'ar-timeline-content flex flex-col min-w-0';
  timelineContent.style.minWidth = 'calc(var(--track-panel-w, 14rem) + 800px)'; /* updated in updateRuler when we have duration */

  /* Sticky horizontal scroll strip: same width as timeline content, scroll synced with scrollContainer */
  const hScrollStrip = document.createElement('div');
  hScrollStrip.className = 'ar-timeline-h-scroll-strip';
  hScrollStrip.setAttribute('aria-hidden', 'true');
  const hScrollSpacer = document.createElement('div');
  hScrollSpacer.className = 'ar-timeline-h-scroll-spacer';
  hScrollSpacer.style.minWidth = 'calc(var(--track-panel-w, 14rem) + 800px)';
  hScrollStrip.appendChild(hScrollSpacer);

  const rulerRow = document.createElement('div');
  rulerRow.className = 'ar-timeline-row flex shrink-0 border-b border-border';
  const rulerLabelCell = document.createElement('div');
  rulerLabelCell.className = 'ar-track-panel-cell ar-ruler-label-cell shrink-0 bg-secondary flex items-center gap-2 px-3 border-r border-border';
  rulerLabelCell.innerHTML = `
    <div class="flex items-center gap-1.5 shrink-0">
      <label for="ar-track-height" class="text-[10px] font-mono text-muted-foreground whitespace-nowrap w-4" title="Track row height (vertical zoom)">H</label>
      <input type="range" id="ar-track-height" class="ar-track-height-slider w-12 h-1.5" min="180" max="900" value="180" title="Track row height (vertical zoom, 180–900px)" />
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <label for="ar-timeline-width" class="text-[10px] font-mono text-muted-foreground whitespace-nowrap w-4" title="Timeline width (horizontal zoom)">W</label>
      <input type="range" id="ar-timeline-width" class="ar-track-height-slider w-12 h-1.5" min="20" max="2000" value="20" title="Timeline horizontal zoom (20–2000 px/sec)" />
    </div>
    <button type="button" class="ar-track-controls-minimize-toggle ar-console-btn h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0" title="Collapse track headers">
      <svg class="ar-toggle-minimise-icon h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      <svg class="ar-toggle-expand-icon h-3.5 w-3.5 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  `;
  const rulerViewport = document.createElement('div');
  rulerViewport.className = 'ar-ruler-viewport flex shrink-0 flex items-end relative bg-secondary';
  const rulerCell = document.createElement('div');
  rulerCell.className = 'ar-ruler-cell flex items-end relative cursor-crosshair ar-ruler-row bg-secondary';
  rulerCell.id = 'ar-ruler';
  rulerCell.setAttribute('tabindex', '0');
  rulerCell.setAttribute('aria-label', 'Timeline ruler');
  rulerViewport.appendChild(rulerCell);
  const rulerSpacer = document.createElement('div');
  rulerSpacer.className = 'ar-ruler-spacer flex-shrink-0';
  rulerRow.appendChild(rulerLabelCell);
  rulerRow.appendChild(rulerViewport);
  rulerRow.appendChild(rulerSpacer);
  timelineContent.appendChild(rulerRow);
  scrollContainer.appendChild(timelineContent);
  timelineTracksWrap.appendChild(scrollContainer);
  timelineTracksWrap.appendChild(hScrollStrip);
  container.appendChild(timelineTracksWrap);

  /* Sync horizontal scroll: main area <-> sticky strip (so strip is always visible and in sync) */
  function syncHScrollFromMain() {
    hScrollStrip.scrollLeft = scrollContainer.scrollLeft;
  }
  function syncHScrollFromStrip() {
    scrollContainer.scrollLeft = hScrollStrip.scrollLeft;
  }
  scrollContainer.addEventListener('scroll', syncHScrollFromMain, { passive: true });
  hScrollStrip.addEventListener('scroll', syncHScrollFromStrip, { passive: true });
  cleanupFns.push(() => {
    scrollContainer.removeEventListener('scroll', syncHScrollFromMain);
    hScrollStrip.removeEventListener('scroll', syncHScrollFromStrip);
  });

  /* ----- Master section (v0: input meter, session info, master meter) + project name ----- */
  const defaultProjectName = `Track Lab Project ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  let projectName = currentProps.initialProjectName ?? defaultProjectName;
  const master = document.createElement('div');
  master.className = 'ar-footer-meters border-t border-border bg-card px-4 py-2 shrink-0';
  master.innerHTML = `
    <div class="ar-footer-meters-inner flex items-center justify-between">
      <div class="flex items-center gap-3" id="ar-input-trigger" role="button" tabindex="0" title="Input source and level">
        <div class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <svg id="ar-mic-icon" class="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <span class="text-xs font-mono text-muted-foreground">Input</span>
        </div>
        <div id="ar-input-meter" class="w-32"></div>
      </div>
      <div class="ar-footer-latency-comp flex items-center gap-2">
        <span class="text-xs text-muted-foreground">Latency Comp</span>
        <span id="ar-latency-comp-display" class="text-xs font-mono text-foreground">0</span>
        <span class="text-[10px] font-mono text-muted-foreground">ms</span>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <svg class="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          <span class="text-xs font-mono text-muted-foreground">Master</span>
        </div>
        <div id="ar-master-meter" class="w-24"></div>
        <span id="ar-master-db" class="text-xs font-mono text-muted-foreground w-10 text-right">-inf</span>
      </div>
    </div>
    <div class="ar-footer-project-name mt-2 pt-2 border-t border-border/50">
      <input type="text" id="ar-project-name" class="w-full bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 px-0" value="${escapeHtml(projectName)}" placeholder="Project name" />
    </div>
  `;
  container.appendChild(master);

  const projectNameInput = container.querySelector('#ar-project-name') as HTMLInputElement;
  function commitProjectName() {
    const val = projectNameInput?.value?.trim();
    if (val && val !== projectName) {
      projectName = val;
      currentProps.onProjectNameChange?.(val);
    }
  }
  projectNameInput?.addEventListener('blur', commitProjectName);
  projectNameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      projectNameInput?.blur();
    }
  });

  const inputMeterEl = container.querySelector('#ar-input-meter') as HTMLElement;
  const masterMeterEl = container.querySelector('#ar-master-meter') as HTMLElement;
  if (inputMeterEl) buildLedGridMeter(inputMeterEl, LEVEL_METER_SEGMENTS);
  if (masterMeterEl) buildLedGridMeter(masterMeterEl, LEVEL_METER_SEGMENTS);

  /* ----- Visual metronome (Knight Rider / Kit style): full width, fixed bottom, pendulum + meteor trail ----- */
  const VISUAL_METRO_SEGMENTS = 51;
  const VISUAL_METRO_TRAIL = 10;
  const visualMetroWrap = document.createElement('div');
  visualMetroWrap.id = 'ar-visual-metro';
  visualMetroWrap.className = 'ar-visual-metro border-t border-border bg-card px-4 py-2 shrink-0';
  visualMetroWrap.setAttribute('aria-hidden', 'true');
  const visualMetroTrack = document.createElement('div');
  visualMetroTrack.className = 'ar-visual-metro-track ar-led-grid w-full';
  for (let i = 0; i < VISUAL_METRO_SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'ar-visual-metro-seg ar-led-seg flex-1 h-2 rounded-sm transition-[background-color,opacity] duration-75';
    seg.dataset.segIndex = String(i);
    visualMetroTrack.appendChild(seg);
  }
  visualMetroWrap.appendChild(visualMetroTrack);
  container.appendChild(visualMetroWrap);

  const countInOverlay = document.createElement('div');
  countInOverlay.id = 'ar-countin-overlay';
  countInOverlay.className = 'absolute inset-0 flex items-center justify-center pointer-events-none z-50 hidden';
  countInOverlay.setAttribute('aria-live', 'polite');
  countInOverlay.innerHTML = '<span id="ar-countin-number" class="font-bold text-foreground/90 tabular-nums leading-none select-none" style="font-size: min(18vw, 18vh);"></span>';
  container.appendChild(countInOverlay);

  const trackStripRefs: {
    panel: HTMLDivElement;
    waveformWrap: HTMLDivElement;
    canvas: HTMLCanvasElement;
    waveformViewport: HTMLDivElement;
    waveformSpacer: HTMLDivElement;
    waveformRow: HTMLDivElement;
  }[] = [];
  /** On mobile (narrow viewport), default to collapsed to save space. */
  let trackControlsMinimized = (() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  })();
  let trackRowHeightPx = 180;
  let timelinePxPerSec = PX_PER_SEC_MIN;
  let snapSetting: SnapSetting = 'Smart';
  type TouchTimelineMode = 'scroll' | 'edit';
  const TOUCH_MODE_STORAGE_KEY = 'ar-touch-timeline-mode';
  let touchTimelineMode: TouchTimelineMode = (() => {
    try {
      const v = localStorage.getItem(TOUCH_MODE_STORAGE_KEY);
      if (v === 'scroll' || v === 'edit') return v;
    } catch {}
    return 'scroll';
  })();
  function applyTouchTimelineMode(): void {
    const touchAction = touchTimelineMode === 'edit' ? 'none' : '';
    trackStripRefs.forEach((ref) => {
      ref.waveformWrap.style.touchAction = touchAction;
    });
  }
  function updateTouchModeButton(): void {
    const btn = container.querySelector('#ar-touch-mode-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const handIcon = container.querySelector('.ar-touch-mode-icon-hand') as SVGSVGElement | null;
    const cursorIcon = container.querySelector('.ar-touch-mode-icon-cursor') as SVGSVGElement | null;
    if (touchTimelineMode === 'scroll') {
      handIcon?.classList.remove('hidden');
      cursorIcon?.classList.add('hidden');
      btn.title = 'Scroll timeline (tap to switch to Edit)';
      btn.setAttribute('aria-label', 'Touch mode: Scroll (tap to switch to Edit)');
    } else {
      handIcon?.classList.add('hidden');
      cursorIcon?.classList.remove('hidden');
      btn.title = 'Edit regions (tap to switch to Scroll)';
      btn.setAttribute('aria-label', 'Touch mode: Edit (tap to switch to Scroll)');
    }
  }
  let panelObserverCleanups: (() => void)[] = [];
  let masterPanelRef: HTMLDivElement | null = null;
  let inputMonitorMenuEl: HTMLElement | null = null;
  let inputMonitorMenuClose: (() => void) | null = null;

  /** Cached panel column width in CSS px; updated on minimize toggle and resize. */
  let cachedPanelWidthPx = 0;
  /** Last inputMonitoring we applied to each track's DOM; only update buttons when this changes to avoid forced reflow (classList then clientHeight read 60fps). */
  let lastInputMonitoringByTrack: InputMonitoringMode[] = [];
  /**
   * Ruler row uses the same panel column as tracks; width must never read as 0 before layout.
   * If cachedPanelWidthPx were 0, buildTransform would treat scrollLeft as pure content scroll
   * (e.g. scrollLeft ≈ panel width looks like ~bar 6–9 instead of bar 1).
   *
   * Underestimating the panel is just as bad: scrollLeftFull − cached stays positive → ruler shows late bars on the left.
   * scrollTimelineToStart() uses scrollLeft 0; during play/zoom, scrollLeft is still cachedPanelWidthPx + content offset.
   *
   * Do not use getBoundingClientRect() on ruler vs viewport when horizontal scroll may be wrong:
   * both cells are sticky (left: 0) and can overlap the scrollport edge, making rect delta ~0.
   *
   * Do not use rulerViewport.offsetLeft: offsetParent is often not the timeline row, so the value
   * can include unrelated horizontal offsets and inflate cachedPanelWidthPx (breaks playhead autoscroll and zoom math).
   */
  function refreshPanelWidth(): void {
    const raw = getComputedStyle(container).getPropertyValue('--track-panel-w').trim();
    let cssPx = 0;
    const remMatch = raw.match(/^([\d.]+)rem$/);
    if (remMatch) {
      const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      cssPx = parseFloat(remMatch[1]) * rootFont;
    } else {
      const pxMatch = raw.match(/^([\d.]+)px$/);
      if (pxMatch) cssPx = parseFloat(pxMatch[1]);
    }
    if (!Number.isFinite(cssPx) || cssPx <= 0) {
      cssPx = trackControlsMinimized ? 64 : 224;
    }
    let w = Math.max(cssPx, rulerLabelCell.offsetWidth);
    const firstTrackPanel = container.querySelector(
      '.ar-timeline-row:not(:first-child) .ar-track-panel-cell'
    ) as HTMLElement | null;
    if (firstTrackPanel) {
      w = Math.max(w, firstTrackPanel.offsetWidth);
    }
    cachedPanelWidthPx = Math.max(1, Math.round(w));
  }

  /** Minimum number of bars to show when the project has no or short content (full-width timeline). */
  const DEFAULT_MIN_BARS = 100;

  /** Build the current TimelineTransform from engine state + scroll position. */
  function buildTransform(): TimelineTransform {
    const state = engine.getState();
    const minDurationSec =
      state.tempo > 0 && state.timeSignature[0] >= 1 && state.timeSignature[1] >= 1
        ? barBeatToSeconds(DEFAULT_MIN_BARS + 1, 1, 0, state.tempo, state.timeSignature)
        : MIN_DURATION;
    const duration = Math.max(state.duration, minDurationSec);
    const contentWidthPx = getContentWidth({ duration, pxPerSec: timelinePxPerSec, scrollLeft: 0, viewportWidth: 0 });
    const scrollLeftFull = scrollContainer.scrollLeft;
    const scrollLeftContent = Math.max(0, scrollLeftFull - cachedPanelWidthPx);
    const clientWidthFull = scrollContainer.clientWidth;
    const visibleWidthPx = Math.min(
      contentWidthPx - scrollLeftContent,
      scrollLeftFull >= cachedPanelWidthPx ? clientWidthFull : clientWidthFull - (cachedPanelWidthPx - scrollLeftFull)
    );
    return {
      duration,
      pxPerSec: timelinePxPerSec,
      scrollLeft: scrollLeftContent,
      viewportWidth: Math.max(1, visibleWidthPx),
    };
  }

  function buildTrackStrips() {
    panelObserverCleanups.forEach((f) => f());
    panelObserverCleanups = [];
    masterPanelRef = null;
    lastInputMonitoringByTrack = [];
    container.classList.toggle('ar-track-controls-minimized', trackControlsMinimized);
    container.style.setProperty('--track-panel-w', trackControlsMinimized ? '4rem' : '14rem');
    while (timelineContent.children.length > 1) timelineContent.removeChild(timelineContent.children[timelineContent.children.length - 1]);
    trackStripRefs.length = 0;
    const state = engine.getState();
    state.tracks.forEach((track) => {
      const row = document.createElement('div');
      row.className = 'ar-timeline-row flex shrink-0 border-b border-border';

      const panelCell = document.createElement('div');
      panelCell.className = 'ar-track-panel-cell shrink-0 border-r border-border bg-card';
      const panel = document.createElement('div');
      const isMinimized = trackControlsMinimized;
      panel.className = `ar-track-panel shrink-0 border-b-0 p-2 flex flex-col gap-1.5 bg-card box-border h-full${isMinimized ? ' ar-track-panel--minimized' : ''}`;
      panel.dataset.trackId = String(track.id);
      panel.style.setProperty('--track-accent', track.color);
      const panLabel = track.pan > 0 ? `R${track.pan}` : track.pan < 0 ? `L${Math.abs(track.pan)}` : 'C';
      const armCls = track.armed ? 'ar-arm-armed bg-destructive text-white' : 'ar-arm-inactive bg-destructive/20 text-destructive';
      const soloCls = track.solo ? 'ar-solo-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
      const muteCls = track.muted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
      const inputMonitorCls =
        track.inputMonitoring === 'off'
          ? 'bg-secondary text-muted-foreground hover:text-foreground'
          : track.inputMonitoring === 'fullFx'
            ? 'ar-input-monitor-effects'
            : 'ar-input-monitor-direct';
      panel.innerHTML = `
        <div class="ar-track-panel-expanded flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="h-3 w-3 rounded-full shrink-0" style="background-color:${track.color}"></div>
              <input type="text" class="ar-track-name bg-transparent border-none text-sm font-medium text-foreground w-24 focus:outline-none focus:bg-secondary rounded px-1" value="${escapeHtml(track.name)}" data-id="${track.id}" />
            </div>
            <button type="button" class="ar-console-btn ar-clear h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive" data-id="${track.id}" title="Clear Track">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" class="ar-console-btn ar-arm h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${armCls}" data-id="${track.id}" title="Arm for Recording">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
            </button>
            <button type="button" class="ar-console-btn ar-solo h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${soloCls}" data-id="${track.id}" title="Solo">S</button>
            <button type="button" class="ar-console-btn ar-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${muteCls}" data-id="${track.id}" title="Mute">M</button>
            <div class="ar-input-monitor-wrap relative">
              <button type="button" class="ar-console-btn ar-input-monitor-btn h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${inputMonitorCls}" data-id="${track.id}" title="Input monitoring">I</button>
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <svg class="h-3 w-3 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <input type="range" class="ar-volume ar-slider flex-1" min="0" max="100" value="${track.volume}" data-id="${track.id}" />
              <span class="ar-vol-value text-[10px] font-mono text-muted-foreground w-7 text-right">${escapeHtml(String(track.volume))}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono text-muted-foreground w-3 shrink-0">P</span>
              <input type="range" class="ar-pan ar-slider flex-1" min="-100" max="100" value="${track.pan}" data-id="${track.id}" />
              <span class="ar-pan-value text-[10px] font-mono text-muted-foreground w-7 text-right">${escapeHtml(panLabel)}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono text-muted-foreground w-3 shrink-0" title="Send to Reverb">R</span>
              <input type="range" class="ar-reverb ar-slider flex-1" min="0" max="100" value="${track.reverb}" data-id="${track.id}" />
              <span class="ar-reverb-value text-[10px] font-mono text-muted-foreground w-7 text-right">${escapeHtml(String(track.reverb))}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono text-muted-foreground w-3 shrink-0" title="Send to Delay">D</span>
              <input type="range" class="ar-delay ar-slider flex-1" min="0" max="100" value="${track.delay}" data-id="${track.id}" />
              <span class="ar-delay-value text-[10px] font-mono text-muted-foreground w-7 text-right">${escapeHtml(String(track.delay))}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono text-muted-foreground w-3 shrink-0" title="Send to Compressor">C</span>
              <input type="range" class="ar-compressor ar-slider flex-1" min="0" max="100" value="${track.compressor}" data-id="${track.id}" />
              <span class="ar-compressor-value text-[10px] font-mono text-muted-foreground w-7 text-right">${escapeHtml(String(track.compressor))}</span>
            </div>
          </div>
        </div>
        <div class="ar-track-panel-minimized flex flex-col items-center gap-1.5">
          <button type="button" class="ar-console-btn ar-arm h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${armCls}" data-id="${track.id}" title="Arm for Recording">
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
          </button>
          <button type="button" class="ar-console-btn ar-solo h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${soloCls}" data-id="${track.id}" title="Solo">S</button>
          <button type="button" class="ar-console-btn ar-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${muteCls}" data-id="${track.id}" title="Mute">M</button>
          <div class="ar-input-monitor-wrap relative">
            <button type="button" class="ar-console-btn ar-input-monitor-btn h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${inputMonitorCls}" data-id="${track.id}" title="Input monitoring">I</button>
          </div>
        </div>
      `;
      panelCell.appendChild(panel);
      row.appendChild(panelCell);

      const waveformRow = document.createElement('div');
      waveformRow.className = `ar-waveform-row ar-waveform-cell flex shrink-0 border-border relative transition-colors box-border ${track.isRecording ? 'bg-destructive/5' : 'bg-card'}`;
      waveformRow.dataset.trackId = String(track.id);
      const waveformViewport = document.createElement('div');
      waveformViewport.className = 'ar-waveform-viewport flex shrink-0 py-2 px-0 relative box-border';
      const waveformWrap = document.createElement('div');
      waveformWrap.className = 'ar-waveform-wrap w-full h-full min-w-0 min-h-0 relative box-border';
      waveformWrap.style.touchAction = touchTimelineMode === 'edit' ? 'none' : '';
      const canvas = document.createElement('canvas');
      canvas.className = 'ar-waveform-canvas block pointer-events-none';
      waveformWrap.appendChild(canvas);
      const recBadge = document.createElement('div');
      recBadge.className = 'absolute top-2 right-2 flex items-center gap-1.5 pointer-events-none hidden ar-rec-badge';
      recBadge.innerHTML = '<div class="h-2 w-2 rounded-full bg-destructive animate-pulse"></div><span class="text-[10px] font-mono text-destructive uppercase tracking-wider">Rec</span>';
      waveformWrap.appendChild(recBadge);
      waveformViewport.appendChild(waveformWrap);
      const waveformSpacer = document.createElement('div');
      waveformSpacer.className = 'ar-waveform-spacer flex-shrink-0';
      waveformRow.appendChild(waveformViewport);
      waveformRow.appendChild(waveformSpacer);
      row.appendChild(waveformRow);
      timelineContent.appendChild(row);
      trackStripRefs.push({ panel, waveformWrap, canvas, waveformViewport, waveformSpacer, waveformRow });
    });

    /* ----- Master track row: Master + Reverb faders ----- */
    const masterRow = document.createElement('div');
    masterRow.className = 'ar-timeline-row flex shrink-0 border-b border-border';
    const masterPanelCell = document.createElement('div');
    masterPanelCell.className = 'ar-track-panel-cell shrink-0 border-r border-border bg-card';
    const masterPanel = document.createElement('div');
    masterPanel.className = `ar-track-panel ar-master-track-panel shrink-0 border-b-0 p-2 flex flex-col gap-1.5 bg-card box-border h-full${trackControlsMinimized ? ' ar-track-panel--minimized' : ''}`;
    masterPanel.dataset.master = 'true';
    masterPanel.style.setProperty('--track-accent', 'var(--destructive)');
    const s = engine.getState();
    const masterMuteCls = s.masterMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    const auxMuteCls = s.auxMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    const delayMuteCls = s.delayMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    const compMuteCls = s.compressorMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    masterPanel.innerHTML = `
      <div class="ar-track-panel-expanded flex flex-col gap-1.5">
        <div class="flex items-center gap-2 flex-wrap">
          <div class="h-3 w-3 rounded-full shrink-0 bg-destructive"></div>
          <span class="text-sm font-medium text-foreground">Busses</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <button type="button" class="ar-bus-reverb-settings text-[10px] font-mono w-10 shrink-0 text-left text-foreground hover:underline cursor-pointer" title="Reverb settings">Reverb</button>
            <input type="range" id="ar-aux-level" class="ar-volume ar-slider flex-1" min="0" max="100" value="${s.auxLevel}" title="Reverb return (80 = 0 dB)" />
            <button type="button" class="ar-console-btn ar-aux-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${auxMuteCls}" title="Mute reverb">M</button>
            <span id="ar-aux-level-value" class="text-[10px] font-mono text-muted-foreground w-6 text-right">${s.auxLevel}</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="ar-bus-delay-settings text-[10px] font-mono w-10 shrink-0 text-left text-foreground hover:underline cursor-pointer" title="Delay settings">Delay</button>
            <input type="range" id="ar-delay-level" class="ar-volume ar-slider flex-1" min="0" max="100" value="${s.delayLevel}" title="Delay return (80 = 0 dB)" />
            <button type="button" class="ar-console-btn ar-delay-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${delayMuteCls}" title="Mute delay">M</button>
            <span id="ar-delay-level-value" class="text-[10px] font-mono text-muted-foreground w-6 text-right">${s.delayLevel}</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="ar-bus-comp-settings text-[10px] font-mono w-10 shrink-0 text-left text-foreground hover:underline cursor-pointer" title="Compressor settings">Comp</button>
            <input type="range" id="ar-compressor-level" class="ar-volume ar-slider flex-1" min="0" max="100" value="${s.compressorLevel}" title="Compressor return (80 = 0 dB)" />
            <button type="button" class="ar-console-btn ar-compressor-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${compMuteCls}" title="Mute compressor">M</button>
            <span id="ar-compressor-level-value" class="text-[10px] font-mono text-muted-foreground w-6 text-right">${s.compressorLevel}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-mono text-muted-foreground w-10 shrink-0">Master</span>
            <input type="range" id="ar-master-level" class="ar-volume ar-slider flex-1" min="0" max="100" value="${s.masterLevel}" title="Master level (80 = 0 dB)" />
            <button type="button" class="ar-console-btn ar-master-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${masterMuteCls}" title="Mute master">M</button>
            <span id="ar-master-level-value" class="text-[10px] font-mono text-muted-foreground w-6 text-right">${s.masterLevel}</span>
          </div>
        </div>
      </div>
      <div class="ar-track-panel-minimized flex flex-col items-center gap-1.5">
        <button type="button" class="ar-console-btn ar-master-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${masterMuteCls}" title="Mute master">M</button>
        <button type="button" class="ar-console-btn ar-aux-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${auxMuteCls}" title="Mute reverb">M</button>
        <button type="button" class="ar-console-btn ar-delay-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${delayMuteCls}" title="Mute delay">M</button>
        <button type="button" class="ar-console-btn ar-compressor-mute h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center ${compMuteCls}" title="Mute compressor">M</button>
      </div>
    `;
    masterPanelCell.appendChild(masterPanel);
    masterRow.appendChild(masterPanelCell);
    const masterWaveformCell = document.createElement('div');
    masterWaveformCell.className = 'ar-waveform-row ar-master-track-row ar-waveform-cell flex-1 min-w-0 flex shrink-0 border-border bg-card box-border';
    const masterRowContent = document.createElement('div');
    masterRowContent.className = 'ar-waveform-wrap flex-1 p-2 min-w-0 flex items-center justify-end';
    masterWaveformCell.appendChild(masterRowContent);
    masterRow.appendChild(masterWaveformCell);
    timelineContent.appendChild(masterRow);
    masterPanelRef = masterPanel;

    const masterLevelInput = container.querySelector('#ar-master-level') as HTMLInputElement | null;
    masterLevelInput?.addEventListener('input', () => engine.setMasterLevel(Number(masterLevelInput.value)));
    const auxLevelInput = container.querySelector('#ar-aux-level') as HTMLInputElement | null;
    auxLevelInput?.addEventListener('input', () => engine.setAuxLevel(Number(auxLevelInput.value)));
    const delayLevelInput = container.querySelector('#ar-delay-level') as HTMLInputElement | null;
    delayLevelInput?.addEventListener('input', () => engine.setDelayLevel(Number(delayLevelInput.value)));
    const compressorLevelInput = container.querySelector('#ar-compressor-level') as HTMLInputElement | null;
    compressorLevelInput?.addEventListener('input', () => engine.setCompressorLevel(Number(compressorLevelInput.value)));
    container.querySelectorAll('.ar-master-mute').forEach((btn) => {
      btn.addEventListener('click', () => engine.setMasterMuted(!engine.getState().masterMuted));
    });
    container.querySelectorAll('.ar-aux-mute').forEach((btn) => {
      btn.addEventListener('click', () => engine.setAuxMuted(!engine.getState().auxMuted));
    });
    container.querySelectorAll('.ar-delay-mute').forEach((btn) => {
      btn.addEventListener('click', () => engine.setDelayMuted(!engine.getState().delayMuted));
    });
    container.querySelectorAll('.ar-compressor-mute').forEach((btn) => {
      btn.addEventListener('click', () => engine.setCompressorMuted(!engine.getState().compressorMuted));
    });
    container.querySelector('.ar-bus-reverb-settings')?.addEventListener('click', () => openMasterReverbModal());
    container.querySelector('.ar-bus-delay-settings')?.addEventListener('click', () => openMasterDelayModal());
    container.querySelector('.ar-bus-comp-settings')?.addEventListener('click', () => openMasterCompressorModal());

    requestAnimationFrame(() => {
      syncTrackHeightsImmediate();
      setTimeout(() => syncTrackHeightsImmediate(), 150);
    });
  }

  let syncTrackHeightsScheduled: ReturnType<typeof setTimeout> | null = null;
  function applyTrackRowHeights() {
    const h = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, trackRowHeightPx));
    trackStripRefs.forEach((ref) => {
      const row = ref.panel.closest('.ar-timeline-row') as HTMLDivElement;
      if (row) row.style.height = `${h}px`;
    });
    if (masterPanelRef) {
      const masterRowEl = masterPanelRef.closest('.ar-timeline-row') as HTMLDivElement;
      if (masterRowEl) masterRowEl.style.height = `${h}px`;
    }
  }
  function syncTrackHeights() {
    if (syncTrackHeightsScheduled != null) clearTimeout(syncTrackHeightsScheduled);
    syncTrackHeightsScheduled = setTimeout(() => {
      syncTrackHeightsScheduled = null;
      applyTrackRowHeights();
    }, 50);
  }
  function syncTrackHeightsImmediate() {
    if (syncTrackHeightsScheduled != null) {
      clearTimeout(syncTrackHeightsScheduled);
      syncTrackHeightsScheduled = null;
    }
    applyTrackRowHeights();
  }

  function updateRuler(tf: TimelineTransform, contentWidthPx: number, viewportWidthPx: number) {
    const state = engine.getState();
    /* Full row width = panel + timeline content so ruler row matches track rows (no purple gap at scroll end) */
    const minWidthValue = `calc(var(--track-panel-w, 14rem) + ${contentWidthPx}px)`;
    timelineContent.style.minWidth = minWidthValue;
    hScrollSpacer.style.minWidth = minWidthValue;

    /* Ruler row: same total width as track rows so horizontal scroll stays in sync */
    const spacerWidthPx = Math.max(0, contentWidthPx - viewportWidthPx);
    rulerRow.style.width = minWidthValue;
    rulerRow.style.minWidth = minWidthValue;
    rulerViewport.style.width = `${viewportWidthPx}px`;
    rulerViewport.style.minWidth = `${viewportWidthPx}px`;
    rulerViewport.style.maxWidth = `${viewportWidthPx}px`;
    rulerSpacer.style.width = `${spacerWidthPx}px`;
    rulerSpacer.style.minWidth = `${spacerWidthPx}px`;

    const ruler = container.querySelector('#ar-ruler') as HTMLDivElement;
    if (!ruler) return;
    ruler.style.width = `${viewportWidthPx}px`;
    ruler.style.minWidth = `${viewportWidthPx}px`;
    ruler.style.maxWidth = `${viewportWidthPx}px`;
    ruler.innerHTML = '';

    const bpm = state.tempo;
    const timeSig = state.timeSignature;
    const useBarBeat = bpm > 0 && timeSig[0] >= 1 && timeSig[1] >= 1;

    if (useBarBeat) {
      const ticks = getRulerTicks(tf, bpm, timeSig);
      for (const tick of ticks) {
        const viewportX = timeToViewportX(tick.positionSeconds, tf);
        if (viewportX < -1 || viewportX > tf.viewportWidth + 1) continue;
        /* Round to same pixel as waveform grid; tick must sit at leftPx (no flex centering) so grid aligns */
        const leftPx = Math.round(viewportX) + 0.5;
        const mark = document.createElement('div');
        mark.className = 'absolute bottom-0 pointer-events-none';
        mark.style.left = `${leftPx}px`;
        mark.style.width = '0';
        mark.style.overflow = 'visible';
        if (tick.label) {
          const timeLabel = document.createElement('span');
          timeLabel.className = tick.isBar ? 'text-[9px] font-mono text-muted-foreground/80 font-medium' : 'text-[8px] font-mono text-muted-foreground/50';
          timeLabel.textContent = tick.label;
          timeLabel.style.position = 'absolute';
          timeLabel.style.left = '50%';
          timeLabel.style.transform = 'translateX(-50%)';
          timeLabel.style.bottom = tick.isBar ? '10px' : '8px';
          mark.appendChild(timeLabel);
        }
        const tickEl = document.createElement('div');
        tickEl.className = tick.isBar ? 'w-px h-2.5 bg-border' : 'w-px h-1.5 bg-border';
        tickEl.style.position = 'absolute';
        tickEl.style.left = '0';
        tickEl.style.bottom = '0';
        mark.appendChild(tickEl);
        ruler.appendChild(mark);
      }
      /* No end-of-track tick: bar/beat ticks from getRulerTicks are enough; an extra tick caused duplicate "67" at the end */
    } else {
      const interval = getRulerInterval(tf);
      for (let t = 0; t <= tf.duration; t += interval) {
        const viewportX = timeToViewportX(t, tf);
        if (viewportX < -1 || viewportX > tf.viewportWidth + 1) continue;
        const leftPx = Math.round(viewportX) + 0.5;
        const mark = document.createElement('div');
        mark.className = 'absolute bottom-0 pointer-events-none';
        mark.style.left = `${leftPx}px`;
        mark.style.width = '0';
        mark.style.overflow = 'visible';
        const timeLabel = document.createElement('span');
        timeLabel.className = 'text-[9px] font-mono text-muted-foreground/60';
        timeLabel.style.position = 'absolute';
        timeLabel.style.left = '50%';
        timeLabel.style.transform = 'translateX(-50%)';
        timeLabel.style.bottom = '10px';
        const totalSec = Math.floor(t);
        const frac = t - totalSec;
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        timeLabel.textContent = frac > 0
          ? `${min}:${sec.toString().padStart(2, '0')}.${Math.round(frac * 10)}`
          : `${min}:${sec.toString().padStart(2, '0')}`;
        mark.appendChild(timeLabel);
        const tick = document.createElement('div');
        tick.className = 'w-px h-2 bg-border';
        tick.style.position = 'absolute';
        tick.style.left = '0';
        tick.style.bottom = '0';
        mark.appendChild(tick);
        ruler.appendChild(mark);
      }
    }

    const displayTime = state.isPlaying ? state.currentTime : (state.startPosition > 0 ? state.startPosition : state.currentTime);
    const playheadViewportX = state.duration > 0 ? timeToViewportX(displayTime, tf) : 0;

    if (!state.isPlaying && state.startPosition > 0 && state.duration > 0) {
      const startViewportX = timeToViewportX(state.startPosition, tf);
      if (startViewportX >= -1 && startViewportX <= tf.viewportWidth + 1) {
        const startMark = document.createElement('div');
        startMark.className = 'absolute top-0 bottom-0 w-px bg-accent z-10 pointer-events-none';
        startMark.style.transform = `translateX(${startViewportX}px)`;
        startMark.style.left = '0';
        startMark.innerHTML = '<div class="absolute -top-0.5 -left-1 w-2.5 h-2.5 bg-accent rotate-45 rounded-sm"></div>';
        ruler.appendChild(startMark);
      }
    }
    /* Show playhead whenever we have content (including at 0.00 when stopped), so it behaves like "user clicked there" */
    const showPlayheadRuler = state.duration > 0 && (state.isPlaying || state.currentTime > 0 || state.startPosition >= 0);
    if (showPlayheadRuler && playheadViewportX >= -1 && playheadViewportX <= tf.viewportWidth + 1) {
      const playhead = document.createElement('div');
      playhead.className = 'absolute top-0 bottom-0 w-px bg-foreground z-10 pointer-events-none';
      playhead.style.transform = `translateX(${playheadViewportX}px)`;
      playhead.style.left = '0';
      playhead.innerHTML = '<div class="absolute -top-0.5 -left-1 w-2.5 h-2.5 bg-foreground rotate-45 rounded-sm"></div>';
      ruler.appendChild(playhead);
    }
  }

  function rulerClick(e: MouseEvent) {
    const state = engine.getState();
    if (state.duration <= 0) return;
    const ruler = container.querySelector('#ar-ruler');
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const tf = buildTransform();
    const time = viewportXToTime(clickX, tf);
    engine.seekTo(Math.max(0, Math.min(time, state.duration)));
  }

  function getPluginTheme(): 'light' | 'dark' {
    if (currentProps.theme) return currentProps.theme;
    const theme = container.closest('[data-theme]')?.getAttribute('data-theme');
    return theme === 'dark' ? 'dark' : 'light';
  }

  /** Shows a confirmation modal. Returns a Promise that resolves to true if Continue, false if Cancel. */
  function showConfirmModal(params: {
    title: string;
    message: string;
    continueLabel?: string;
    cancelLabel?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ar-overlay-theme-host fixed inset-0 bg-black/50 z-[115] flex items-center justify-center p-4';
      overlay.setAttribute('data-theme', getPluginTheme());
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', params.title);
      const panel = document.createElement('div');
      panel.className = 'bg-background border border-border rounded-lg shadow-lg max-w-md w-full p-4 flex flex-col gap-4';
      panel.innerHTML = `
        <h2 class="text-sm font-semibold text-foreground">${escapeHtml(params.title)}</h2>
        <p class="text-sm text-muted-foreground">${escapeHtml(params.message)}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="ar-confirm-cancel text-xs text-muted-foreground hover:text-foreground bg-secondary hover:bg-border px-3 py-1.5 rounded transition-colors font-medium">${escapeHtml(params.cancelLabel ?? 'Cancel')}</button>
          <button type="button" class="ar-confirm-continue text-xs text-foreground bg-accent hover:bg-accent-hover px-3 py-1.5 rounded transition-colors font-medium">${escapeHtml(params.continueLabel ?? 'Continue')}</button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.appendChild(panel);

      const finish = (value: boolean) => {
        overlay.remove();
        resolve(value);
      };
      panel.querySelector('.ar-confirm-continue')?.addEventListener('click', () => finish(true));
      panel.querySelector('.ar-confirm-cancel')?.addEventListener('click', () => finish(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(false);
      });
    });
  }

  function openLatencyCalibrationModal(settingsPanel?: HTMLElement) {
    const overlay = document.createElement('div');
    overlay.className = 'ar-overlay-theme-host fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4';
    overlay.setAttribute('data-theme', getPluginTheme());
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Latency calibration');
    const panel = document.createElement('div');
    panel.className = 'bg-background border border-border rounded-lg shadow-lg max-w-md w-full p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto';
    panel.innerHTML = `
      <div class="flex items-center justify-between shrink-0">
        <h2 class="text-sm font-semibold text-foreground">Latency calibration</h2>
        <button type="button" id="ar-cal-close" class="text-muted-foreground hover:text-foreground p-1 rounded" title="Close">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="text-xs text-muted-foreground">Align recorded audio with the click. Uses your device’s reported latency (recommended with headphones).</p>
      <div id="ar-ping-status" class="text-sm text-muted-foreground min-h-[1.25rem]"></div>
      <div id="ar-cal-result" class="text-sm font-mono text-foreground border-t border-border pt-3 mt-1 min-h-[1.5rem]"></div>
    `;
    document.body.appendChild(overlay);
    overlay.appendChild(panel);

    const pingStatusEl = panel.querySelector('#ar-ping-status') as HTMLElement;
    const resultEl = panel.querySelector('#ar-cal-result') as HTMLElement;

    function closeCal() {
      const existingStream = engine.getActiveInputStream?.() ?? null;
      if (!existingStream) {
        engine.stopSustainedInputStream();
        engine.startSustainedInputStream().catch(() => {});
      }
      overlay.remove();
      if (settingsPanel && document.contains(settingsPanel)) {
        const compEl = settingsPanel.querySelector('#ar-settings-comp-value');
        if (compEl) compEl.textContent = String(engine.getState().latencyCompensationMs);
      }
      if (container.isConnected) {
        scrollTimelineToStart();
        requestAnimationFrame(updateUI);
      }
      setTimeout(() => openSettingsModal(existingStream), 0);
    }

    panel.querySelector('#ar-cal-close')?.addEventListener('click', closeCal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeCal();
    });

    (async () => {
      try {
        pingStatusEl.textContent = 'Warming up…';
        await engine.startSustainedInputStream();
        pingStatusEl.textContent = 'Waking up interface…';
        await engine.playWhiteNoiseBurst(100);
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        engine.stopSustainedInputStream();
        pingStatusEl.textContent = e instanceof Error ? e.message : 'Warm-up failed.';
        return;
      }
      const values: number[] = [];
      for (let i = 0; i < 5; i++) {
        pingStatusEl.textContent = `Estimating… ${i + 1}/5`;
        try {
          const ms = await engine.getLatencyEstimateMs();
          values.push(ms);
        } catch {
          /* skip failed run */
        }
      }
      engine.stopSustainedInputStream();
      if (values.length === 0) {
        pingStatusEl.textContent = 'Estimate failed. Try again.';
        return;
      }
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      engine.setLatencyCompensationMs(avg);
      if (settingsPanel && document.contains(settingsPanel)) {
        const compEl = settingsPanel.querySelector('#ar-settings-comp-value');
        if (compEl) compEl.textContent = String(avg);
        const qualityEl = settingsPanel.querySelector('#ar-monitoring-quality');
        if (qualityEl) {
          const q = engine.getMonitoringQuality?.();
          qualityEl.textContent =
            q === 'good'
              ? 'Monitoring: Good'
              : q === 'borderline'
                ? 'Monitoring: Borderline — wired headphones recommended'
                : 'Monitoring: High latency — use wired or hardware monitoring';
        }
      }
      pingStatusEl.textContent = 'Done.';
      if (resultEl) resultEl.textContent = `${avg} ms`;
      await new Promise((r) => setTimeout(r, 1200));
      closeCal();
    })();
  }

  function openSettingsModal(initialStream?: MediaStream | null) {
    const t0 = Date.now();
    _dbg(0, 'openSettingsModal:entry', 'A');
    const state = engine.getState();
    _dbg(Date.now() - t0, 'openSettingsModal:afterGetState', 'B');
    const overlay = document.createElement('div');
    overlay.className = 'ar-overlay-theme-host fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4';
    overlay.setAttribute('data-theme', getPluginTheme());
    _dbg(Date.now() - t0, 'openSettingsModal:afterGetPluginTheme', 'C');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Settings');
    const panel = document.createElement('div');
    panel.className = 'bg-background border border-border rounded-lg shadow-lg max-w-sm w-full p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto';
    panel.innerHTML = `
      <div class="flex items-center justify-between shrink-0">
        <h2 class="text-sm font-semibold text-foreground">Settings</h2>
        <button type="button" id="ar-input-modal-close" class="text-muted-foreground hover:text-foreground p-1 rounded" title="Close">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div id="ar-input-modal-loading" class="text-sm text-muted-foreground">Loading…</div>
      <div id="ar-input-modal-content" class="hidden flex-col gap-4">
        <p id="ar-input-modal-message" class="hidden text-sm text-muted-foreground" role="status"></p>
        <fieldset class="flex flex-col gap-3 border border-border rounded-lg p-3">
          <legend class="text-xs font-mono text-muted-foreground uppercase tracking-wider px-1">Input</legend>
          <div class="flex flex-col gap-2">
            <label for="ar-input-device-select" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Device</label>
            <select id="ar-input-device-select" class="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"></select>
          </div>
          <div class="flex flex-col gap-2" id="ar-input-channel-wrap">
            <label for="ar-input-channel-select" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Input channel</label>
            <select id="ar-input-channel-select" class="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"></select>
          </div>
          <div class="flex flex-col gap-2">
            <label for="ar-input-gain-slider" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Input level</label>
            <div class="flex items-center gap-2">
              <input type="range" id="ar-input-gain-slider" class="ar-slider flex-1" min="0" max="100" value="${state.inputGain}" />
              <span id="ar-input-gain-value" class="text-xs font-mono text-muted-foreground w-10 text-right">${state.inputGain}</span>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Level meter</span>
            <div id="ar-input-modal-meter" class="flex gap-px h-4 w-full"></div>
          </div>
        </fieldset>
        <fieldset class="flex flex-col gap-3 border border-border rounded-lg p-3">
          <legend class="text-xs font-mono text-muted-foreground uppercase tracking-wider px-1">Output</legend>
          <div class="flex flex-col gap-2">
            <label for="ar-output-device-select" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Device</label>
            <select id="ar-output-device-select" class="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"></select>
          </div>
          <div class="flex flex-col gap-2">
            <label for="ar-output-channel-select" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Output channels</label>
            <select id="ar-output-channel-select" class="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent" title="Web Audio sends stereo to the selected device; routing to specific outputs is handled by the OS.">
              <option value="default">Default (stereo L+R)</option>
            </select>
          </div>
          <p class="text-xs text-muted-foreground" id="ar-output-wired-tip">Wired headphones are recommended for live input monitoring; Bluetooth can add noticeable delay.</p>
        </fieldset>
        <fieldset class="flex flex-col gap-3 border border-border rounded-lg p-3">
          <legend class="text-xs font-mono text-muted-foreground uppercase tracking-wider px-1">Latency compensation</legend>
          <p class="text-xs text-muted-foreground">Start of each recording is trimmed by this amount so playback stays in sync with the metronome.</p>
          <div class="flex items-center gap-2">
            <span id="ar-settings-comp-value" class="text-sm font-mono text-foreground">${state.latencyCompensationMs}</span>
            <span class="text-xs font-mono text-muted-foreground">ms</span>
            <button type="button" id="ar-settings-calibrate" class="ml-2 text-xs text-accent hover:underline">Calibrate latency</button>
          </div>
          <p class="text-xs text-muted-foreground" id="ar-monitoring-quality"></p>
        </fieldset>
      </div>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    _dbg(Date.now() - t0, 'openSettingsModal:afterAppendToBody', 'D');

    function setMonitoringQualityLabel(el: Element | null) {
      if (!el) return;
      const q = engine.getMonitoringQuality?.();
      if (!q) return;
      const text =
        q === 'good'
          ? 'Monitoring: Good'
          : q === 'borderline'
            ? 'Monitoring: Borderline — wired headphones recommended'
            : 'Monitoring: High latency — use wired or hardware monitoring';
      el.textContent = text;
    }
    setMonitoringQualityLabel(panel.querySelector('#ar-monitoring-quality'));

    let previewCtx: AudioContext | null = null;
    let previewStream: MediaStream | null = null;
    let previewSource: MediaStreamAudioSourceNode | null = null;
    let previewGain: GainNode | null = null;
    let previewAnalyser: AnalyserNode | null = null;
    let previewRafId = 0;
    const data = new Uint8Array(256);

    function stopPreview() {
      if (previewRafId) cancelAnimationFrame(previewRafId);
      previewRafId = 0;
      if (previewStream) {
        const isEngineStream = engine.getActiveInputStream?.() === previewStream;
        if (!isEngineStream) previewStream.getTracks().forEach((t) => t.stop());
        previewStream = null;
      }
      previewSource = null;
      previewGain = null;
      previewAnalyser = null;
      if (previewCtx && previewCtx.state !== 'closed') previewCtx.close();
      previewCtx = null;
    }

    function closeModal() {
      stopPreview();
      overlay.remove();
      scheduleScrollHomeAfterModalClose();
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    panel.querySelector('#ar-input-modal-close')?.addEventListener('click', closeModal);

    function updateMeter(level: number) {
      const meterEl = panel.querySelector('#ar-input-modal-meter');
      if (meterEl) meterEl.innerHTML = buildLevelMeterSegments(level);
    }

    function startPreview(stream: MediaStream, channelIndex: number = 0) {
      const tracks = stream.getAudioTracks();
      const idx = Math.min(Math.max(0, channelIndex), tracks.length - 1);
      const track = tracks[idx];
      const streamToUse = track ? new MediaStream([track]) : stream;
      if (previewCtx) {
        if (previewSource) previewSource.disconnect();
      } else {
        previewCtx = new AudioContext({ latencyHint: 'interactive' });
      }
      previewStream = stream;
      previewSource = previewCtx!.createMediaStreamSource(streamToUse);
      if (!previewGain) {
        previewGain = previewCtx!.createGain();
        previewAnalyser = previewCtx!.createAnalyser();
        previewAnalyser.fftSize = 2048;
        previewGain.connect(previewAnalyser);
      }
      previewSource.connect(previewGain!);
      const gainVal = engine.getState().inputGain;
      if (previewGain) previewGain.gain.value = gainVal / 100;
      const gainSlider = panel.querySelector('#ar-input-gain-slider') as HTMLInputElement;
      if (gainSlider) gainSlider.value = String(gainVal);
      const gainValueEl = panel.querySelector('#ar-input-gain-value');
      if (gainValueEl) gainValueEl.textContent = String(gainVal);
      if (!previewRafId) {
        function tick() {
          if (!previewAnalyser) return;
          previewAnalyser.getByteTimeDomainData(data);
          let max = 0;
          for (let i = 0; i < data.length; i++) {
            const val = Math.abs(data[i] - 128) / 128;
            if (val > max) max = val;
          }
          updateMeter(max);
          previewRafId = requestAnimationFrame(tick);
        }
        tick();
      }
    }

    function populateInputChannels(stream: MediaStream) {
      const channelSelect = panel.querySelector('#ar-input-channel-select') as HTMLSelectElement;
      const channelWrap = panel.querySelector('#ar-input-channel-wrap') as HTMLElement;
      const tracks = stream.getAudioTracks();
      channelSelect.innerHTML = '';
      if (tracks.length <= 1) {
        channelWrap.classList.add('hidden');
        channelSelect.appendChild(new Option('Default', '0'));
        return;
      }
      channelWrap.classList.remove('hidden');
      tracks.forEach((t, i) => {
        const label = t.label || `Channel ${i + 1}`;
        channelSelect.appendChild(new Option(label, String(i)));
      });
      const preferred = Math.min(engine.getState().inputChannelIndex, tracks.length - 1);
      channelSelect.value = String(preferred);
      engine.setInputChannelIndex(preferred);
    }

    type DeviceLoadResult =
      | { ok: true; stream: MediaStream; devices: MediaDeviceInfo[] }
      | { ok: false; timedOut: true }
      | { ok: false; error: unknown };

    function showFallbackContent(
      loadingEl: HTMLElement,
      contentEl: HTMLElement,
      messageEl: HTMLElement,
      inputDeviceSelect: HTMLSelectElement,
      outputDeviceSelect: HTMLSelectElement,
      channelWrap: HTMLElement,
      message: string
    ) {
      loadingEl.classList.add('hidden');
      messageEl.textContent = message;
      messageEl.classList.remove('hidden');
      contentEl.classList.remove('hidden');
      contentEl.classList.add('flex', 'flex-col', 'gap-4');

      inputDeviceSelect.innerHTML = '';
      const defaultIn = document.createElement('option');
      defaultIn.value = '';
      defaultIn.textContent = 'Default microphone';
      inputDeviceSelect.appendChild(defaultIn);

      outputDeviceSelect.innerHTML = '';
      const defaultOut = document.createElement('option');
      defaultOut.value = '';
      defaultOut.textContent = 'Default output';
      outputDeviceSelect.appendChild(defaultOut);

      channelWrap.classList.add('hidden');

      inputDeviceSelect.addEventListener('change', () => {
        engine.setInputDevice(inputDeviceSelect.value || null);
      });
      outputDeviceSelect.addEventListener('change', () => {
        engine.setOutputDevice(outputDeviceSelect.value || null);
      });
      const gainSlider = panel.querySelector('#ar-input-gain-slider') as HTMLInputElement;
      gainSlider?.addEventListener('input', () => {
        const v = Number(gainSlider.value);
        engine.setInputGain(v);
        const gainValueEl = panel.querySelector('#ar-input-gain-value');
        if (gainValueEl) gainValueEl.textContent = String(v);
      });
      panel.querySelector('#ar-settings-calibrate')?.addEventListener('click', () => {
        openLatencyCalibrationModal(panel);
      });
    }

    async function loadDevicesAndPreview(initialStream?: MediaStream) {
      _dbg(Date.now() - t0, 'loadDevicesAndPreview:start', 'F');
      const loadingEl = panel.querySelector('#ar-input-modal-loading') as HTMLElement;
      const contentEl = panel.querySelector('#ar-input-modal-content') as HTMLElement;
      const messageEl = panel.querySelector('#ar-input-modal-message') as HTMLElement;
      const inputDeviceSelect = panel.querySelector('#ar-input-device-select') as HTMLSelectElement;
      const channelSelect = panel.querySelector('#ar-input-channel-select') as HTMLSelectElement;
      const outputDeviceSelect = panel.querySelector('#ar-output-device-select') as HTMLSelectElement;
      const channelWrap = panel.querySelector('#ar-input-channel-wrap') as HTMLElement;

      const loadResult = await Promise.race([
        (async (): Promise<DeviceLoadResult> => {
          try {
            let stream: MediaStream;
            if (initialStream && initialStream.active) {
              stream = initialStream;
              _dbg(Date.now() - t0, 'loadDevicesAndPreview:reusedStream', 'G');
            } else {
              const preferredId = engine.getState().inputDeviceId;
              const constraints: MediaStreamConstraints = preferredId
                ? { audio: { deviceId: { exact: preferredId } } }
                : { audio: true };
              stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
              _dbg(Date.now() - t0, 'loadDevicesAndPreview:afterGetUserMedia', 'G');
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            _dbg(Date.now() - t0, 'loadDevicesAndPreview:afterEnumerateDevices', 'H');
            return { ok: true as const, stream, devices };
          } catch (e) {
            return { ok: false as const, error: e };
          }
        })(),
        new Promise<DeviceLoadResult>((resolve) =>
          setTimeout(() => resolve({ ok: false, timedOut: true }), DEVICE_LOAD_TIMEOUT_MS)
        ),
      ]);

      if (!loadResult.ok) {
        const message =
          'timedOut' in loadResult && loadResult.timedOut
            ? 'Device list is taking longer than usual. Using default devices.'
            : 'Microphone access denied or device list unavailable. Using default devices.';
        if ('error' in loadResult && loadResult.error) console.error('Settings modal device load failed', loadResult.error);
        showFallbackContent(
          loadingEl,
          contentEl,
          messageEl,
          inputDeviceSelect,
          outputDeviceSelect,
          channelWrap,
          message
        );
        return;
      }

      const { stream, devices } = loadResult;
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      inputDeviceSelect.innerHTML = '';
      const defaultIn = document.createElement('option');
      defaultIn.value = '';
      defaultIn.textContent = 'Default microphone';
      inputDeviceSelect.appendChild(defaultIn);
      const preferredInId = engine.getState().inputDeviceId;
      inputs.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Microphone ${inputDeviceSelect.options.length}`;
        if (d.deviceId === preferredInId) opt.selected = true;
        inputDeviceSelect.appendChild(opt);
      });
      outputDeviceSelect.innerHTML = '';
      const defaultOut = document.createElement('option');
      defaultOut.value = '';
      defaultOut.textContent = 'Default output';
      outputDeviceSelect.appendChild(defaultOut);
      const preferredOut = engine.getState().outputDeviceId;
      outputs.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Output ${outputDeviceSelect.options.length}`;
        if (d.deviceId === preferredOut) opt.selected = true;
        outputDeviceSelect.appendChild(opt);
      });
      channelWrap.classList.remove('hidden');
      populateInputChannels(stream);
      const channelIndex = Math.min(engine.getState().inputChannelIndex, stream.getAudioTracks().length - 1);
      if (stream.getAudioTracks().length > 1) engine.setInputChannelIndex(channelIndex);
      loadingEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
      contentEl.classList.add('flex', 'flex-col', 'gap-4');
      _dbg(Date.now() - t0, 'loadDevicesAndPreview:contentVisible', 'I');
      requestAnimationFrame(() => startPreview(stream, channelIndex));

      let currentStream = stream;
      inputDeviceSelect.addEventListener('change', async () => {
        const deviceId = inputDeviceSelect.value || null;
        engine.setInputDevice(deviceId);
        stopPreview();
        try {
          const c = deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true };
          currentStream = await navigator.mediaDevices.getUserMedia(c);
          populateInputChannels(currentStream);
          const idx = Math.min(engine.getState().inputChannelIndex, currentStream.getAudioTracks().length - 1);
          engine.setInputChannelIndex(idx);
          startPreview(currentStream, idx);
        } catch (e) {
          console.error('Failed to switch input device', e);
        }
      });

      channelSelect.addEventListener('change', () => {
        const idx = Number(channelSelect.value) || 0;
        engine.setInputChannelIndex(idx);
        startPreview(currentStream, idx);
      });

      outputDeviceSelect.addEventListener('change', () => {
        const deviceId = outputDeviceSelect.value || null;
        engine.setOutputDevice(deviceId);
      });

      const gainSlider = panel.querySelector('#ar-input-gain-slider') as HTMLInputElement;
      gainSlider?.addEventListener('input', () => {
        const v = Number(gainSlider.value);
        engine.setInputGain(v);
        const gainValueEl = panel.querySelector('#ar-input-gain-value');
        if (gainValueEl) gainValueEl.textContent = String(v);
        if (previewGain) previewGain.gain.value = v / 100;
      });

      panel.querySelector('#ar-settings-calibrate')?.addEventListener('click', () => {
        openLatencyCalibrationModal(panel);
      });
    }

    _dbg(Date.now() - t0, 'openSettingsModal:beforeLoadDevicesAndPreview', 'E');
    loadDevicesAndPreview(initialStream ?? undefined);
  }

  function closeInputMonitorMenu() {
    if (inputMonitorMenuClose) {
      inputMonitorMenuClose();
      inputMonitorMenuClose = null;
    }
    if (inputMonitorMenuEl?.parentNode) inputMonitorMenuEl.parentNode.removeChild(inputMonitorMenuEl);
    inputMonitorMenuEl = null;
  }

  const INPUT_MONITORING_TIPS_ACK_KEY = 'inputMonitoringTipsAcknowledged';

  function openInputMonitoringTipsModal(trackId: number, selectedMode: InputMonitoringMode) {
    const overlay = document.createElement('div');
    overlay.className = 'ar-overlay-theme-host fixed inset-0 bg-black/50 z-[125] flex items-center justify-center p-4';
    overlay.setAttribute('data-theme', getPluginTheme());
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Input monitoring tips');
    const panel = document.createElement('div');
    panel.className = 'bg-background border border-border rounded-lg shadow-lg max-w-md w-full p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto';
    panel.innerHTML = `
      <div class="flex items-center justify-between shrink-0">
        <h2 class="text-sm font-semibold text-foreground">Input monitoring tips</h2>
        <button type="button" class="ar-input-monitoring-tips-close text-muted-foreground hover:text-foreground p-1 rounded" title="Close">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="text-xs text-muted-foreground">Please read before using input monitoring. You’ll only see this once.</p>
      <ol class="text-xs text-foreground list-decimal list-inside space-y-2 flex flex-col gap-2">
        <li>Use wired headphones (not wireless/Bluetooth).</li>
        <li>Expect that some devices will have latency.</li>
        <li>Try a comfort mode or dry mode first.</li>
        <li>Try <strong>Comfort FX</strong> with one headphone on and the other ear plugged — Comfort FX has no dry signal to help reduce latency feel.</li>
        <li>If all else fails, don’t enable input monitoring and track like an old 4-track: add FX later for polish.</li>
      </ol>
      <p class="text-xs text-muted-foreground">Browser-based DAWs have the same limitations as traditional DAWs, plus a few other tradeoffs. Keep this in mind.</p>
      <div class="flex justify-end shrink-0 pt-2">
        <button type="button" class="ar-input-monitoring-tips-ack ar-console-btn px-4 py-2 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90">
          Got it
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.appendChild(panel);

    function closeModal() {
      overlay.remove();
    }

    async function acknowledge() {
      try {
        await currentProps.setPluginSetting?.(INPUT_MONITORING_TIPS_ACK_KEY, true);
      } catch {
        /* ignore */
      }
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ar-input-monitoring-tips-ack', '1');
      closeModal();
      engine.setInputMonitoring(trackId, selectedMode);
    }

    panel.querySelector('.ar-input-monitoring-tips-close')?.addEventListener('click', () => {
      closeModal();
    });
    panel.querySelector('.ar-input-monitoring-tips-ack')?.addEventListener('click', () => {
      acknowledge();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  function openInputMonitorMenu(trackId: number, button: HTMLElement) {
    closeInputMonitorMenu();
    const s = engine.getState();
    const track = s.tracks.find((t) => t.id === trackId);
    const current = track?.inputMonitoring ?? 'off';
    const rect = button.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'ar-input-monitor-menu ar-overlay-theme-host fixed z-[120] min-w-[10rem] py-1 rounded border border-border bg-background shadow-lg';
    menu.setAttribute('data-theme', getPluginTheme());
    const modes: Array<{ mode: InputMonitoringMode; label: string; warn?: string }> = [
      { mode: 'off', label: 'Off' },
      { mode: 'lowLatency', label: 'Low Latency (dry)' },
      { mode: 'comfort', label: 'Comfort' },
      { mode: 'comfortFx', label: 'Comfort FX' },
      { mode: 'fullFx', label: 'Full FX (may add delay)', warn: 'Higher latency' },
    ];
    modes.forEach(({ mode, label, warn }) => {
      const isActive = current === mode;
      const itemCls = isActive
        ? mode === 'fullFx'
          ? 'ar-input-monitor-option-active-effects'
          : 'ar-input-monitor-option-active' /* lowLatency, comfort, comfortFx */
        : '';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `ar-input-monitor-option w-full text-left text-xs px-3 py-1.5 hover:bg-muted flex flex-col items-start gap-0 ${itemCls}`;
      const labelEl = document.createElement('span');
      labelEl.className = 'ar-input-monitor-option-label';
      labelEl.textContent = label;
      item.appendChild(labelEl);
      if (warn) {
        const warnEl = document.createElement('span');
        warnEl.className = 'ar-input-monitor-option-warn';
        warnEl.textContent = warn;
        item.appendChild(warnEl);
      }
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (mode === 'off') {
          engine.setInputMonitoring(trackId, mode);
          closeInputMonitorMenu();
          return;
        }
        const acknowledged =
          (await currentProps.getPluginSetting?.('inputMonitoringTipsAcknowledged')) === true ||
          (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ar-input-monitoring-tips-ack') === '1');
        if (acknowledged) {
          engine.setInputMonitoring(trackId, mode);
          closeInputMonitorMenu();
          return;
        }
        closeInputMonitorMenu();
        openInputMonitoringTipsModal(trackId, mode);
      });
      menu.appendChild(item);
    });
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    document.body.appendChild(menu);
    inputMonitorMenuEl = menu;
    const onDocClick = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== button) closeInputMonitorMenu();
    };
    inputMonitorMenuClose = () => {
      document.removeEventListener('click', onDocClick);
    };
    requestAnimationFrame(() => document.addEventListener('click', onDocClick));
  }

  function sliderRow(
    id: string,
    label: string,
    min: number,
    max: number,
    value: number,
    valueLabel: string,
    step: string = '0.01'
  ) {
    return `
      <div class="flex flex-col gap-2">
        <label for="${id}" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">${label}</label>
        <div class="flex items-center gap-2">
          <input type="range" id="${id}" class="ar-slider flex-1" min="${min}" max="${max}" value="${value}" step="${step}" />
          <span id="${id}-value" class="text-xs font-mono text-muted-foreground w-14 text-right">${valueLabel}</span>
        </div>
      </div>`;
  }

  function openMasterReverbModal() {
    const s = engine.getState();
    const overlay = document.createElement('div');
    overlay.className = 'ar-overlay-theme-host fixed inset-0 bg-black/50 z-[115] flex items-center justify-center p-4';
    overlay.setAttribute('data-theme', getPluginTheme());
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Master Reverb');
    const panel = document.createElement('div');
    panel.className = 'bg-background border border-border rounded-lg shadow-lg max-w-sm w-full p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto';
    panel.innerHTML = `
      <div class="flex items-center justify-between shrink-0">
        <h2 class="text-sm font-semibold text-foreground">Master Reverb</h2>
        <button type="button" class="ar-master-reverb-close text-muted-foreground hover:text-foreground p-1 rounded" title="Close">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="text-xs text-muted-foreground">Return level and mute are on the Master row.</p>
      <div class="flex flex-col gap-3">
        ${sliderRow('ar-reverb-preDelay', 'Pre-delay (ms)', 0, 500, s.reverbPreDelayMs, String(s.reverbPreDelayMs), '1')}
        ${sliderRow('ar-reverb-bandwidth', 'Bandwidth', 0, 1, s.reverbBandwidth, s.reverbBandwidth.toFixed(2))}
        ${sliderRow('ar-reverb-inputDiffusion1', 'Input diffusion 1', 0, 1, s.reverbInputDiffusion1, s.reverbInputDiffusion1.toFixed(2))}
        ${sliderRow('ar-reverb-inputDiffusion2', 'Input diffusion 2', 0, 1, s.reverbInputDiffusion2, s.reverbInputDiffusion2.toFixed(2))}
        ${sliderRow('ar-reverb-decay', 'Decay', 0, 1, s.reverbDecay, s.reverbDecay.toFixed(2))}
        ${sliderRow('ar-reverb-decayDiffusion1', 'Decay diffusion 1', 0, 1, s.reverbDecayDiffusion1, s.reverbDecayDiffusion1.toFixed(2))}
        ${sliderRow('ar-reverb-decayDiffusion2', 'Decay diffusion 2', 0, 1, s.reverbDecayDiffusion2, s.reverbDecayDiffusion2.toFixed(2))}
        ${sliderRow('ar-reverb-damping', 'Damping', 0, 1, s.reverbDamping, s.reverbDamping.toFixed(3))}
        ${sliderRow('ar-reverb-excursionRate', 'Excursion rate', 0, 2, s.reverbExcursionRate, s.reverbExcursionRate.toFixed(2))}
        ${sliderRow('ar-reverb-excursionDepth', 'Excursion depth', 0, 2, s.reverbExcursionDepth, s.reverbExcursionDepth.toFixed(2))}
        ${sliderRow('ar-reverb-dry', 'Dry', 0, 1, s.reverbDry, s.reverbDry.toFixed(2))}
        ${sliderRow('ar-reverb-wet', 'Wet', 0, 1, s.reverbWet, s.reverbWet.toFixed(2))}
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.appendChild(panel);
    const bind = (id: string, set: (v: number) => void, fmt: (v: number) => string = (v) => v.toFixed(2)) => {
      const input = panel.querySelector(`#${id}`) as HTMLInputElement;
      const valueEl = panel.querySelector(`#${id}-value`);
      if (!input || !valueEl) return;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        set(v);
        valueEl.textContent = fmt(v);
      });
    };
    bind('ar-reverb-preDelay', (v) => engine.setReverbPreDelayMs(v), (v) => String(Math.round(v)));
    bind('ar-reverb-bandwidth', (v) => engine.setReverbBandwidth(v));
    bind('ar-reverb-inputDiffusion1', (v) => engine.setReverbInputDiffusion1(v));
    bind('ar-reverb-inputDiffusion2', (v) => engine.setReverbInputDiffusion2(v));
    bind('ar-reverb-decay', (v) => engine.setReverbDecay(v));
    bind('ar-reverb-decayDiffusion1', (v) => engine.setReverbDecayDiffusion1(v));
    bind('ar-reverb-decayDiffusion2', (v) => engine.setReverbDecayDiffusion2(v));
    bind('ar-reverb-damping', (v) => engine.setReverbDamping(v), (v) => v.toFixed(3));
    bind('ar-reverb-excursionRate', (v) => engine.setReverbExcursionRate(v));
    bind('ar-reverb-excursionDepth', (v) => engine.setReverbExcursionDepth(v));
    bind('ar-reverb-dry', (v) => engine.setReverbDry(v));
    bind('ar-reverb-wet', (v) => engine.setReverbWet(v));
    panel.querySelector('.ar-master-reverb-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  function openMasterDelayModal() {
    const s = engine.getState();
    const overlay = document.createElement('div');
    overlay.className = 'ar-overlay-theme-host fixed inset-0 bg-black/50 z-[115] flex items-center justify-center p-4';
    overlay.setAttribute('data-theme', getPluginTheme());
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Master Delay');
    const panel = document.createElement('div');
    panel.className = 'bg-background border border-border rounded-lg shadow-lg max-w-sm w-full p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto';
    panel.innerHTML = `
      <div class="flex items-center justify-between shrink-0">
        <h2 class="text-sm font-semibold text-foreground">Master Delay</h2>
        <button type="button" class="ar-master-delay-close text-muted-foreground hover:text-foreground p-1 rounded" title="Close">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-2">
          <label for="ar-delay-time-ms" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Time (ms)</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-delay-time-ms" class="ar-slider flex-1" min="1" max="2000" value="${s.delayTimeMs}" />
            <span id="ar-delay-time-value" class="text-xs font-mono text-muted-foreground w-14 text-right">${s.delayTimeMs}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label for="ar-delay-feedback" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Feedback (0–100)</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-delay-feedback" class="ar-slider flex-1" min="0" max="100" value="${s.delayFeedback}" />
            <span id="ar-delay-feedback-value" class="text-xs font-mono text-muted-foreground w-10 text-right">${s.delayFeedback}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label for="ar-delay-wet" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Wet (0–100)</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-delay-wet" class="ar-slider flex-1" min="0" max="100" value="${s.delayWet}" />
            <span id="ar-delay-wet-value" class="text-xs font-mono text-muted-foreground w-10 text-right">${s.delayWet}</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.appendChild(panel);
    const timeInput = panel.querySelector('#ar-delay-time-ms') as HTMLInputElement;
    const timeVal = panel.querySelector('#ar-delay-time-value');
    const feedbackInput = panel.querySelector('#ar-delay-feedback') as HTMLInputElement;
    const feedbackVal = panel.querySelector('#ar-delay-feedback-value');
    const wetInput = panel.querySelector('#ar-delay-wet') as HTMLInputElement;
    const wetVal = panel.querySelector('#ar-delay-wet-value');
    timeInput?.addEventListener('input', () => {
      const v = Number(timeInput.value);
      engine.setDelayTimeMs(v);
      if (timeVal) timeVal.textContent = String(v);
    });
    feedbackInput?.addEventListener('input', () => {
      const v = Number(feedbackInput.value);
      engine.setDelayFeedback(v);
      if (feedbackVal) feedbackVal.textContent = String(v);
    });
    wetInput?.addEventListener('input', () => {
      const v = Number(wetInput.value);
      engine.setDelayWet(v);
      if (wetVal) wetVal.textContent = String(v);
    });
    panel.querySelector('.ar-master-delay-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  function openMasterCompressorModal() {
    const s = engine.getState();
    const overlay = document.createElement('div');
    overlay.className = 'ar-overlay-theme-host fixed inset-0 bg-black/50 z-[115] flex items-center justify-center p-4';
    overlay.setAttribute('data-theme', getPluginTheme());
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Master Compressor');
    const panel = document.createElement('div');
    panel.className = 'bg-background border border-border rounded-lg shadow-lg max-w-sm w-full p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto';
    panel.innerHTML = `
      <div class="flex items-center justify-between shrink-0">
        <h2 class="text-sm font-semibold text-foreground">Master Compressor</h2>
        <button type="button" class="ar-master-comp-close text-muted-foreground hover:text-foreground p-1 rounded" title="Close">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <input type="checkbox" id="ar-compressor-enabled" ${s.compressorEnabled ? 'checked' : ''} class="rounded border-border" />
          <label for="ar-compressor-enabled" class="text-xs font-mono text-muted-foreground">Enabled (bypass when off)</label>
        </div>
        <div class="flex flex-col gap-2">
          <label for="ar-compressor-threshold" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Threshold (dB)</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-compressor-threshold" class="ar-slider flex-1" min="-100" max="0" value="${s.compressorThreshold}" />
            <span id="ar-compressor-threshold-value" class="text-xs font-mono text-muted-foreground w-12 text-right">${s.compressorThreshold}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label for="ar-compressor-knee" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Knee (dB)</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-compressor-knee" class="ar-slider flex-1" min="0" max="40" value="${s.compressorKnee}" />
            <span id="ar-compressor-knee-value" class="text-xs font-mono text-muted-foreground w-10 text-right">${s.compressorKnee}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label for="ar-compressor-ratio" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Ratio</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-compressor-ratio" class="ar-slider flex-1" min="1" max="20" value="${s.compressorRatio}" step="0.1" />
            <span id="ar-compressor-ratio-value" class="text-xs font-mono text-muted-foreground w-10 text-right">${s.compressorRatio}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label for="ar-compressor-attack" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Attack (s)</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-compressor-attack" class="ar-slider flex-1" min="0" max="1" value="${s.compressorAttack}" step="0.001" />
            <span id="ar-compressor-attack-value" class="text-xs font-mono text-muted-foreground w-12 text-right">${s.compressorAttack.toFixed(3)}</span>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label for="ar-compressor-release" class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Release (s)</label>
          <div class="flex items-center gap-2">
            <input type="range" id="ar-compressor-release" class="ar-slider flex-1" min="0" max="1" value="${s.compressorRelease}" step="0.001" />
            <span id="ar-compressor-release-value" class="text-xs font-mono text-muted-foreground w-12 text-right">${s.compressorRelease.toFixed(3)}</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.appendChild(panel);
    const enabledInput = panel.querySelector('#ar-compressor-enabled') as HTMLInputElement;
    enabledInput?.addEventListener('change', () => engine.setCompressorEnabled(enabledInput.checked));
    const thresholdInput = panel.querySelector('#ar-compressor-threshold') as HTMLInputElement;
    const thresholdVal = panel.querySelector('#ar-compressor-threshold-value');
    thresholdInput?.addEventListener('input', () => {
      const v = Number(thresholdInput.value);
      engine.setCompressorThreshold(v);
      if (thresholdVal) thresholdVal.textContent = String(v);
    });
    const kneeInput = panel.querySelector('#ar-compressor-knee') as HTMLInputElement;
    const kneeVal = panel.querySelector('#ar-compressor-knee-value');
    kneeInput?.addEventListener('input', () => {
      const v = Number(kneeInput.value);
      engine.setCompressorKnee(v);
      if (kneeVal) kneeVal.textContent = String(v);
    });
    const ratioInput = panel.querySelector('#ar-compressor-ratio') as HTMLInputElement;
    const ratioVal = panel.querySelector('#ar-compressor-ratio-value');
    ratioInput?.addEventListener('input', () => {
      const v = Number(ratioInput.value);
      engine.setCompressorRatio(v);
      if (ratioVal) ratioVal.textContent = String(v);
    });
    const attackInput = panel.querySelector('#ar-compressor-attack') as HTMLInputElement;
    const attackVal = panel.querySelector('#ar-compressor-attack-value');
    attackInput?.addEventListener('input', () => {
      const v = Number(attackInput.value);
      engine.setCompressorAttack(v);
      if (attackVal) attackVal.textContent = v.toFixed(3);
    });
    const releaseInput = panel.querySelector('#ar-compressor-release') as HTMLInputElement;
    const releaseVal = panel.querySelector('#ar-compressor-release-value');
    releaseInput?.addEventListener('input', () => {
      const v = Number(releaseInput.value);
      engine.setCompressorRelease(v);
      if (releaseVal) releaseVal.textContent = v.toFixed(3);
    });
    panel.querySelector('.ar-master-comp-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  function updateUI() {
    const state = engine.getState();
    const timeEl = container.querySelector('#ar-time');
    const durationEl = container.querySelector('#ar-duration');
    if (timeEl) timeEl.textContent = formatTime(state.currentTime);
    if (durationEl) durationEl.textContent = formatTime(state.duration);

    const barbeatEl = container.querySelector('#ar-barbeat');
    const durationBarbeatEl = container.querySelector('#ar-duration-barbeat');
    if (state.tempo > 0 && state.timeSignature[0] >= 1 && state.timeSignature[1] >= 1) {
      const bb = secondsToBarBeat(state.currentTime, state.tempo, state.timeSignature);
      if (barbeatEl) barbeatEl.textContent = `${bb.bar}.${bb.beat}`;
      const durBb = secondsToBarBeat(state.duration, state.tempo, state.timeSignature);
      if (durationBarbeatEl) durationBarbeatEl.textContent = `${durBb.bar}.${durBb.beat}`;
    } else {
      if (barbeatEl) barbeatEl.textContent = '1.1';
      if (durationBarbeatEl) durationBarbeatEl.textContent = '1.1';
    }

    const timeSigNumEl = container.querySelector('#ar-time-sig-num') as HTMLElement | null;
    const timeSigDenEl = container.querySelector('#ar-time-sig-den') as HTMLElement | null;
    if (timeSigNumEl && timeSigNumEl.textContent !== String(state.timeSignature[0])) timeSigNumEl.textContent = String(state.timeSignature[0]);
    if (timeSigDenEl && timeSigDenEl.textContent !== String(state.timeSignature[1])) timeSigDenEl.textContent = String(state.timeSignature[1]);

    const snapSelect = container.querySelector('#ar-snap') as HTMLSelectElement | null;
    if (snapSelect && snapSelect.value !== snapSetting) snapSelect.value = snapSetting;

    const recordBtn = container.querySelector('#ar-record') as HTMLElement;
    if (recordBtn) {
      recordBtn.classList.toggle('bg-destructive', state.isRecording);
      recordBtn.classList.toggle('bg-destructive/10', !state.isRecording && !state.isCountingIn);
      recordBtn.classList.toggle('text-destructive', !state.isRecording);
      recordBtn.classList.toggle('text-white', state.isRecording);
      recordBtn.classList.toggle('animate-pulse', state.isRecording || state.isCountingIn);
      if (state.isCountingIn && !state.isRecording) {
        recordBtn.classList.add('bg-[hsl(var(--track-solo))]', 'text-[hsl(220,16%,4%)]');
        recordBtn.classList.remove('text-destructive', 'bg-destructive/10');
      } else {
        recordBtn.classList.remove('bg-[hsl(var(--track-solo))]', 'text-[hsl(220,16%,4%)]');
      }
      recordBtn.title = state.isRecording ? 'Stop Recording' : state.isCountingIn ? 'Cancel (count-in)' : 'Record';
    }

    const stopBtn = container.querySelector('#ar-stop') as HTMLElement;
    if (stopBtn) {
      const canStop = state.isPlaying || state.isRecording || state.isCountingIn;
      stopBtn.classList.toggle('text-accent', canStop);
      stopBtn.classList.toggle('bg-accent/10', canStop);
      stopBtn.classList.toggle('opacity-70', !canStop);
      stopBtn.title = canStop ? 'Stop' : 'Stop';
    }

    const playBtn = container.querySelector('#ar-play') as HTMLElement;
    const playIcon = container.querySelector('#ar-play-icon');
    if (playBtn && playIcon) {
      playBtn.classList.toggle('text-accent', state.isPlaying);
      playBtn.classList.toggle('bg-accent/10', state.isPlaying);
      if (state.isPlaying) {
        playIcon.outerHTML = '<svg id="ar-play-icon" class="h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      } else {
        playIcon.outerHTML = '<svg id="ar-play-icon" class="h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
    }

    const metronomeBtn = container.querySelector('#ar-metronome');
    if (metronomeBtn) {
      metronomeBtn.classList.toggle('text-accent', state.metronomeEnabled);
      metronomeBtn.classList.toggle('bg-accent/10', state.metronomeEnabled);
    }
    const countinBtn = container.querySelector('#ar-countin');
    if (countinBtn) {
      countinBtn.classList.toggle('text-accent', state.countInEnabled);
      countinBtn.classList.toggle('bg-accent/10', state.countInEnabled);
    }

    const undoBtn = container.querySelector('#ar-undo') as HTMLButtonElement | null;
    const redoBtn = container.querySelector('#ar-redo') as HTMLButtonElement | null;
    const undoIcon = container.querySelector('#ar-undo-icon');
    const redoIcon = container.querySelector('#ar-redo-icon');
    const canUndo = 'canUndo' in state ? state.canUndo : false;
    const canRedo = 'canRedo' in state ? state.canRedo : false;
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
    if (undoIcon) {
      undoIcon.classList.toggle('text-primary', !!canUndo);
      undoIcon.classList.toggle('text-muted-foreground', !canUndo);
    }
    if (redoIcon) {
      redoIcon.classList.toggle('text-primary', !!canRedo);
      redoIcon.classList.toggle('text-muted-foreground', !canRedo);
    }

    const countInDots = container.querySelector('#ar-countin-dots') as HTMLElement;
    if (countInDots) {
      countInDots.classList.toggle('hidden', !state.isCountingIn);
      countInDots.innerHTML = '';
      if (state.isCountingIn) {
        for (let i = 0; i < state.countInBeats; i++) {
          const dot = document.createElement('div');
          dot.className = `h-2.5 w-2.5 rounded-full transition-all duration-100 ${i < state.currentCountInBeat ? 'bg-[var(--track-solo)] scale-110' : 'bg-secondary'}`;
          countInDots.appendChild(dot);
        }
      }
    }

    const countInOverlayEl = container.querySelector('#ar-countin-overlay') as HTMLElement;
    const countInNumberEl = container.querySelector('#ar-countin-number') as HTMLElement;
    if (countInOverlayEl && countInNumberEl) {
      const showBigCount = state.countInEnabled && !state.metronomeEnabled && state.isCountingIn;
      countInOverlayEl.classList.toggle('hidden', !showBigCount);
      if (showBigCount) {
        const n = state.countInBeats - state.currentCountInBeat + 1;
        countInNumberEl.textContent = String(n);
      }
    }

    refreshPanelWidth();
    const tf = buildTransform();
    /* Use integer widths so ruler and waveform stay in sync (no fractional-pixel gap at scroll end) */
    const viewportWidthPx = Math.max(1, Math.floor(tf.viewportWidth));
    const contentWidthPx = Math.max(viewportWidthPx, Math.floor(getContentWidth(tf)));
    const tfAligned: TimelineTransform = { ...tf, viewportWidth: viewportWidthPx };
    updateRuler(tfAligned, contentWidthPx, viewportWidthPx);

    /* Autoscroll: page-based. Only scroll when playhead reaches the right edge; then advance by a full
     * viewport so the playhead is just past the left edge (AUTOSCROLL_LEFT_OFFSET_PX for controls that mask the first bit).
     * Redraws only when we page — less jumpy and more efficient. */
    if (state.isPlaying && state.duration > 0 && tfAligned.viewportWidth > 0) {
      const playheadPx = timeToContentX(state.currentTime, tfAligned);
      const rightEdge = tfAligned.scrollLeft + tfAligned.viewportWidth;
      if (playheadPx >= rightEdge - 1) {
        const newScrollLeftContent = Math.max(
          0,
          Math.min(playheadPx - AUTOSCROLL_LEFT_OFFSET_PX, contentWidthPx - tfAligned.viewportWidth)
        );
        scrollContainer.scrollLeft = cachedPanelWidthPx + newScrollLeftContent;
      }
    }

    /* Single display time computed once -- used by both ruler and all waveforms */
    const displayTime = state.isPlaying
      ? state.currentTime
      : state.startPosition > 0
        ? state.startPosition
        : state.currentTime;

    /* Size waveform row + sticky viewport + spacer so canvas is viewport-wide (redraw on zoom, no pixel stretch) */
    const spacerWidthPx = Math.max(0, contentWidthPx - tfAligned.viewportWidth);
    trackStripRefs.forEach((ref) => {
      ref.waveformRow.style.width = `${contentWidthPx}px`;
      ref.waveformRow.style.minWidth = `${contentWidthPx}px`;
      ref.waveformViewport.style.width = `${viewportWidthPx}px`;
      ref.waveformViewport.style.minWidth = `${viewportWidthPx}px`;
      ref.waveformViewport.style.maxWidth = `${viewportWidthPx}px`;
      ref.waveformSpacer.style.width = `${spacerWidthPx}px`;
      ref.waveformSpacer.style.minWidth = `${spacerWidthPx}px`;
    });

    const playheadColor =
      getComputedStyle(container).getPropertyValue('--foreground').trim() ||
      getComputedStyle(container).color ||
      '#1a1a1a';

    state.tracks.forEach((track, i) => {
      const ref = trackStripRefs[i];
      if (!ref) return;
      const waveformRow = ref.waveformRow;
      if (waveformRow) waveformRow.classList.toggle('bg-destructive/5', track.isRecording);
      ref.panel.style.setProperty('--track-accent', track.color);
      const nameInput = ref.panel.querySelector('.ar-track-name') as HTMLInputElement;
      if (nameInput && nameInput.value !== track.name) nameInput.value = track.name;
      ref.panel.querySelectorAll('.ar-arm').forEach((armBtn) => {
        armBtn.classList.toggle('ar-arm-armed', track.armed);
        armBtn.classList.toggle('ar-arm-inactive', !track.armed);
        armBtn.classList.toggle('text-white', track.armed);
        armBtn.classList.toggle('text-destructive', !track.armed);
        armBtn.classList.toggle('bg-destructive', track.armed);
        armBtn.classList.toggle('bg-destructive/20', !track.armed);
      });
      ref.panel.querySelectorAll('.ar-solo').forEach((soloBtn) => {
        soloBtn.classList.toggle('ar-solo-active', track.solo);
        soloBtn.classList.toggle('bg-secondary', !track.solo);
        soloBtn.classList.toggle('text-muted-foreground', !track.solo);
      });
      ref.panel.querySelectorAll('.ar-mute').forEach((muteBtn) => {
        muteBtn.classList.toggle('ar-mute-active', track.muted);
        muteBtn.classList.toggle('bg-secondary', !track.muted);
        muteBtn.classList.toggle('text-muted-foreground', !track.muted);
      });
      if (lastInputMonitoringByTrack[i] !== track.inputMonitoring) {
        lastInputMonitoringByTrack[i] = track.inputMonitoring;
        ref.panel.querySelectorAll('.ar-input-monitor-btn').forEach((monitorBtn) => {
          monitorBtn.classList.remove(
            'ar-input-monitor-direct',
            'ar-input-monitor-effects',
            'bg-secondary',
            'text-muted-foreground'
          );
          if (track.inputMonitoring === 'off') {
            monitorBtn.classList.add('bg-secondary', 'text-muted-foreground');
          } else if (track.inputMonitoring === 'fullFx') {
            monitorBtn.classList.add('ar-input-monitor-effects');
          } else {
            monitorBtn.classList.add('ar-input-monitor-direct');
          }
        });
      }
      const volInput = ref.panel.querySelector('.ar-volume') as HTMLInputElement;
      if (volInput) {
        volInput.value = String(track.volume);
        volInput.style.setProperty('--slider-percent', String(track.volume));
      }
      const volVal = ref.panel.querySelector('.ar-vol-value');
      if (volVal) volVal.textContent = String(track.volume);
      const panInput = ref.panel.querySelector('.ar-pan') as HTMLInputElement;
      if (panInput) {
        panInput.value = String(track.pan);
        const thumbPct = 50 + (track.pan / 100) * 50;
        const panLeftEnd = track.pan <= 0 ? thumbPct : 50;
        const panRightStart = track.pan >= 0 ? thumbPct : 50;
        panInput.style.setProperty('--pan-left-end', String(panLeftEnd));
        panInput.style.setProperty('--pan-right-start', String(panRightStart));
      }
      const panVal = ref.panel.querySelector('.ar-pan-value');
      if (panVal) panVal.textContent = track.pan > 0 ? `R${track.pan}` : track.pan < 0 ? `L${Math.abs(track.pan)}` : 'C';
      const reverbInput = ref.panel.querySelector('.ar-reverb') as HTMLInputElement;
      if (reverbInput) {
        reverbInput.value = String(track.reverb);
        reverbInput.style.setProperty('--slider-percent', String(track.reverb));
      }
      const reverbVal = ref.panel.querySelector('.ar-reverb-value');
      if (reverbVal) reverbVal.textContent = String(track.reverb);
      const delayInput = ref.panel.querySelector('.ar-delay') as HTMLInputElement;
      if (delayInput) {
        delayInput.value = String(track.delay);
        delayInput.style.setProperty('--slider-percent', String(track.delay));
      }
      const delayVal = ref.panel.querySelector('.ar-delay-value');
      if (delayVal) delayVal.textContent = String(track.delay);
      const compressorInput = ref.panel.querySelector('.ar-compressor') as HTMLInputElement;
      if (compressorInput) {
        compressorInput.value = String(track.compressor);
        compressorInput.style.setProperty('--slider-percent', String(track.compressor));
      }
      const compressorVal = ref.panel.querySelector('.ar-compressor-value');
      if (compressorVal) compressorVal.textContent = String(track.compressor);

      const recordingElapsed = track.isRecording ? Math.max(0, state.currentTime - state.startPosition) : 0;
      const rowHeight = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, trackRowHeightPx));
      /* Use wrap height so canvas fits inside viewport (viewport has py-2); avoids bottom border being clipped */
      const wrapH = ref.waveformWrap.clientHeight;
      const canvasHeight = Math.max(1, wrapH > 0 ? wrapH : rowHeight - 16);
      drawWaveform(
        ref.canvas,
        ref.waveformWrap,
        track,
        displayTime,
        state.startPosition,
        state.isPlaying,
        recordingElapsed,
        canvasHeight,
        tfAligned,
        playheadColor,
        { tempo: state.tempo, timeSignature: state.timeSignature, snapSetting }
      );
      const recBadgeEl = ref.waveformWrap.querySelector('.ar-rec-badge') as HTMLElement;
      if (recBadgeEl) recBadgeEl.classList.toggle('hidden', !track.isRecording);
    });

    const inputMeter = container.querySelector('#ar-input-meter') as HTMLElement | null;
    if (inputMeter) {
      updateLedGridMeter(inputMeter, state.inputLevel, LEVEL_METER_SEGMENTS);
    }
    const masterMeter = container.querySelector('#ar-master-meter') as HTMLElement | null;
    if (masterMeter) {
      updateLedGridMeter(masterMeter, state.isRecording ? state.inputLevel * 0.8 : 0, LEVEL_METER_SEGMENTS);
    }
    const masterDb = container.querySelector('#ar-master-db');
    if (masterDb) masterDb.textContent = state.isRecording ? `${Math.round(state.inputLevel * -60)}dB` : '-inf';
    const micIcon = container.querySelector('#ar-mic-icon');
    if (micIcon) micIcon.classList.toggle('text-destructive', state.isRecording);

    const latencyCompDisplay = container.querySelector('#ar-latency-comp-display');
    if (latencyCompDisplay) latencyCompDisplay.textContent = String(state.latencyCompensationMs);
    const masterLevelInput = container.querySelector('#ar-master-level') as HTMLInputElement | null;
    if (masterLevelInput) {
      masterLevelInput.value = String(state.masterLevel);
      masterLevelInput.style.setProperty('--slider-percent', String(state.masterLevel));
    }
    const masterLevelValue = container.querySelector('#ar-master-level-value');
    if (masterLevelValue) masterLevelValue.textContent = String(state.masterLevel);
    const auxLevelInput = container.querySelector('#ar-aux-level') as HTMLInputElement | null;
    if (auxLevelInput) {
      auxLevelInput.value = String(state.auxLevel);
      auxLevelInput.style.setProperty('--slider-percent', String(state.auxLevel));
    }
    const auxLevelValue = container.querySelector('#ar-aux-level-value');
    if (auxLevelValue) auxLevelValue.textContent = String(state.auxLevel);
    const delayLevelInputSync = container.querySelector('#ar-delay-level') as HTMLInputElement | null;
    if (delayLevelInputSync) {
      delayLevelInputSync.value = String(state.delayLevel);
      delayLevelInputSync.style.setProperty('--slider-percent', String(state.delayLevel));
    }
    const delayLevelValue = container.querySelector('#ar-delay-level-value');
    if (delayLevelValue) delayLevelValue.textContent = String(state.delayLevel);
    const compressorLevelInputSync = container.querySelector('#ar-compressor-level') as HTMLInputElement | null;
    if (compressorLevelInputSync) {
      compressorLevelInputSync.value = String(state.compressorLevel);
      compressorLevelInputSync.style.setProperty('--slider-percent', String(state.compressorLevel));
    }
    const compressorLevelValue = container.querySelector('#ar-compressor-level-value');
    if (compressorLevelValue) compressorLevelValue.textContent = String(state.compressorLevel);
    const masterMuteCls = state.masterMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    const auxMuteCls = state.auxMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    const delayMuteClsSync = state.delayMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    const compMuteClsSync = state.compressorMuted ? 'ar-mute-active' : 'bg-secondary text-muted-foreground hover:text-foreground';
    const muteBase = 'ar-console-btn h-6 w-6 rounded text-[10px] font-bold flex items-center justify-center';
    container.querySelectorAll('.ar-master-mute').forEach((btn) => {
      (btn as HTMLElement).className = `${muteBase} ar-master-mute ${masterMuteCls}`;
    });
    container.querySelectorAll('.ar-aux-mute').forEach((btn) => {
      (btn as HTMLElement).className = `${muteBase} ar-aux-mute ${auxMuteCls}`;
    });
    container.querySelectorAll('.ar-delay-mute').forEach((btn) => {
      (btn as HTMLElement).className = `${muteBase} ar-delay-mute ${delayMuteClsSync}`;
    });
    container.querySelectorAll('.ar-compressor-mute').forEach((btn) => {
      (btn as HTMLElement).className = `${muteBase} ar-compressor-mute ${compMuteClsSync}`;
    });
  }

  const onScrollRedraw = () => requestAnimationFrame(updateUI);
  scrollContainer.addEventListener('scroll', onScrollRedraw, { passive: true });
  cleanupFns.push(() => scrollContainer.removeEventListener('scroll', onScrollRedraw));

  const playBtnRef = { current: null as HTMLButtonElement | null };
  function bindTransport() {
    const skipBack = container.querySelector('#ar-skipback');
    skipBack?.addEventListener('click', () => engine.skipBack());
    playBtnRef.current = container.querySelector('#ar-play') as HTMLButtonElement | null;
    const handleTransportClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#ar-play')) {
        e.preventDefault();
        e.stopPropagation();
        if (engine.getState().isPlaying) engine.pause();
        else engine.play();
        return;
      }
      if (target.closest('#ar-stop')) {
        e.preventDefault();
        e.stopPropagation();
        engine.stop();
        (document.activeElement as HTMLElement)?.blur();
        const moveFocusToTimeline = () =>
          container.querySelector<HTMLElement>('#ar-ruler')?.focus({ preventScroll: true });
        requestAnimationFrame(() => {
          requestAnimationFrame(moveFocusToTimeline);
          setTimeout(moveFocusToTimeline, 80);
        });
        return;
      }
    };
    container.addEventListener('click', handleTransportClick, true);
    cleanupFns.push(() => container.removeEventListener('click', handleTransportClick, true));
    container.querySelector('#ar-record')?.addEventListener('click', () => engine.record());
    engine.setNoArmedTrackListener(() => showArmTrackNotice());
    const tempoInput = container.querySelector('#ar-tempo') as HTMLInputElement;
    tempoInput?.addEventListener('change', () => engine.setTempo(Number(tempoInput.value) || 120));
    const timeSigNumBtn = container.querySelector('#ar-time-sig-num') as HTMLElement;
    const timeSigDenBtn = container.querySelector('#ar-time-sig-den') as HTMLElement;
    timeSigNumBtn?.addEventListener('click', () => {
      const [num, den] = engine.getState().timeSignature;
      const next = (num % 12) + 1;
      engine.setTimeSignature(next, den);
      requestAnimationFrame(updateUI);
    });
    timeSigDenBtn?.addEventListener('click', () => {
      const [num, den] = engine.getState().timeSignature;
      const next = (den % 12) + 1;
      engine.setTimeSignature(num, next);
      requestAnimationFrame(updateUI);
    });
    const snapSelect = container.querySelector('#ar-snap') as HTMLSelectElement;
    snapSelect?.addEventListener('change', () => {
      snapSetting = (snapSelect.value || 'Smart') as SnapSetting;
      requestAnimationFrame(updateUI);
    });
    const touchModeBtn = container.querySelector('#ar-touch-mode-btn') as HTMLButtonElement | null;
    touchModeBtn?.addEventListener('click', () => {
      touchTimelineMode = touchTimelineMode === 'scroll' ? 'edit' : 'scroll';
      try {
        localStorage.setItem(TOUCH_MODE_STORAGE_KEY, touchTimelineMode);
      } catch {}
      applyTouchTimelineMode();
      updateTouchModeButton();
    });
    updateTouchModeButton();
    container.querySelector('#ar-metronome')?.addEventListener('click', () => engine.toggleMetronome());
    container.querySelector('#ar-countin')?.addEventListener('click', () => engine.toggleCountIn());
    container.querySelector('#ar-save')?.addEventListener('click', async () => {
      const exports = await engine.exportRecordings();
      if (exports.length === 0 && !currentProps.projectId) return;
      const confirmed = await showConfirmModal({
        title: 'Save to song',
        message:
          'This will save your current tracks and project to this song. If you are editing an existing project, it will be updated with the current name and settings.',
      });
      if (!confirmed) return;
      const s = engine.getState();
      const projectData: TrackLabProjectData = {
        tempo: s.tempo,
        timeSignature: s.timeSignature,
        tracks: s.tracks.map((t) => ({
          trackIndex: t.id,
          name: t.name,
          volume: t.volume,
          pan: t.pan,
          reverb: t.reverb,
          delay: t.delay,
          compressor: t.compressor,
          inputMonitoring: t.inputMonitoring,
          muted: t.muted,
          solo: t.solo,
        })),
        masterEffects: {
          reverbLevel: s.auxLevel,
          reverbMuted: s.auxMuted,
          reverbPreDelayMs: s.reverbPreDelayMs,
          reverbBandwidth: s.reverbBandwidth,
          reverbInputDiffusion1: s.reverbInputDiffusion1,
          reverbInputDiffusion2: s.reverbInputDiffusion2,
          reverbDecay: s.reverbDecay,
          reverbDecayDiffusion1: s.reverbDecayDiffusion1,
          reverbDecayDiffusion2: s.reverbDecayDiffusion2,
          reverbDamping: s.reverbDamping,
          reverbExcursionRate: s.reverbExcursionRate,
          reverbExcursionDepth: s.reverbExcursionDepth,
          reverbWet: s.reverbWet,
          reverbDry: s.reverbDry,
          delayLevel: s.delayLevel,
          delayMuted: s.delayMuted,
          delayTimeMs: s.delayTimeMs,
          delayFeedback: s.delayFeedback,
          delayWet: s.delayWet,
          compressorLevel: s.compressorLevel,
          compressorMuted: s.compressorMuted,
          compressorThreshold: s.compressorThreshold,
          compressorKnee: s.compressorKnee,
          compressorRatio: s.compressorRatio,
          compressorAttack: s.compressorAttack,
          compressorRelease: s.compressorRelease,
          compressorEnabled: s.compressorEnabled,
        },
      };
      const name = projectNameInput?.value?.trim() || projectName || defaultProjectName;
      if (name !== projectName) projectName = name;
      if (currentProps.onSaveProject) {
        currentProps.onSaveProject(exports, projectData, name);
      } else if (currentProps.onSaveRecordings) {
        currentProps.onSaveRecordings(exports);
      }
    });
    container.querySelector('#ar-mixdown')?.addEventListener('click', async () => {
      const confirmed = await showConfirmModal({
        title: 'Mix down',
        message:
          'All tracks will be mixed to a single stereo file and downloaded. This may take a moment depending on the length of your project.',
      });
      if (!confirmed) return;
      const btn = container.querySelector('#ar-mixdown') as HTMLButtonElement | null;
      const label = container.querySelector('#ar-mixdown-label') as HTMLElement | null;
      if (btn) btn.disabled = true;
      if (label) label.textContent = 'Mixing…';
      try {
        const result = await engine.mixDown();
        if (result && currentProps.onMixDown) {
          currentProps.onMixDown(result.blob, result.durationSeconds);
        }
      } finally {
        if (btn) btn.disabled = false;
        if (label) label.textContent = 'Mix down';
      }
    });
    container.querySelector('#ar-close')?.addEventListener('click', async () => {
      const hasUnsavedChanges = engine.getState().canUndo;
      const confirmed = await showConfirmModal({
        title: 'Close Track Lab',
        message: hasUnsavedChanges
          ? 'You have unsaved changes. Are you sure you want to close Track Lab?'
          : 'Are you sure you want to close Track Lab?',
      });
      if (confirmed) currentProps.onClose?.();
    });
    container.querySelector('#ar-undo')?.addEventListener('click', () => engine.undo());
    container.querySelector('#ar-redo')?.addEventListener('click', () => engine.redo());
    const ruler = container.querySelector('#ar-ruler');
    ruler?.addEventListener('click', (e: Event) => rulerClick(e as MouseEvent));
    container.querySelector('.ar-btn-settings')?.addEventListener('click', () => openSettingsModal());
    function syncTrackControlsToggleIcon() {
      const minimiseIcon = container.querySelector('.ar-toggle-minimise-icon');
      const expandIcon = container.querySelector('.ar-toggle-expand-icon');
      if (minimiseIcon && expandIcon) {
        minimiseIcon.classList.toggle('hidden', trackControlsMinimized);
        expandIcon.classList.toggle('hidden', !trackControlsMinimized);
      }
      const toggleBtn = container.querySelector('.ar-track-controls-minimize-toggle');
      if (toggleBtn) toggleBtn.setAttribute('title', trackControlsMinimized ? 'Expand track controls' : 'Minimise track controls');
    }
    syncTrackControlsToggleIcon(); // initial state (e.g. minimized on mobile)
    container.querySelector('.ar-track-controls-minimize-toggle')?.addEventListener('click', () => {
      trackControlsMinimized = !trackControlsMinimized;
      container.classList.toggle('ar-track-controls-minimized', trackControlsMinimized);
      container.style.setProperty('--track-panel-w', trackControlsMinimized ? '4rem' : '14rem');
      container.querySelectorAll('.ar-track-panel[data-track-id]').forEach((p) => {
        p.classList.toggle('ar-track-panel--minimized', trackControlsMinimized);
      });
      const masterPanel = container.querySelector('.ar-track-panel[data-master="true"]');
      if (masterPanel) masterPanel.classList.toggle('ar-track-panel--minimized', trackControlsMinimized);
      syncTrackControlsToggleIcon();
      syncTrackHeightsImmediate();
      requestAnimationFrame(() => refreshPanelWidth());
    });
    const trackHeightInput = container.querySelector('#ar-track-height') as HTMLInputElement;
    if (trackHeightInput) {
      container.style.setProperty('--ar-track-row-height', `${trackRowHeightPx}px`);
      trackHeightInput.value = String(trackRowHeightPx);
      trackHeightInput.addEventListener('input', () => {
        trackRowHeightPx = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, Number(trackHeightInput.value) || HEIGHT_MIN));
        container.style.setProperty('--ar-track-row-height', `${trackRowHeightPx}px`);
        syncTrackHeightsImmediate();
        requestAnimationFrame(() => updateUI());
      });
    }
    function applyTimelineWidthZoom(value: number) {
      const tfOld = buildTransform();
      const T = engine.getState().isPlaying
        ? engine.getState().currentTime
        : engine.getState().startPosition > 0
          ? engine.getState().startPosition
          : engine.getState().currentTime;
      const playheadPxOld = timeToContentX(T, tfOld);
      const anchorOffset = playheadPxOld - tfOld.scrollLeft;

      timelinePxPerSec = Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, value));
      const tfNew = buildTransform();
      const contentWidthNew = Math.max(1, Math.floor(getContentWidth(tfNew)));
      const viewportWidthNew = Math.max(1, Math.floor(tfNew.viewportWidth));
      updateRuler({ ...tfNew, viewportWidth: viewportWidthNew }, contentWidthNew, viewportWidthNew);

      const contentWidthPxNew = contentWidthNew;
      const playheadPxNew = timeToContentX(T, { ...tfNew, viewportWidth: viewportWidthNew });
      const newScrollLeftContent = Math.max(
        0,
        Math.min(playheadPxNew - anchorOffset, contentWidthPxNew - viewportWidthNew)
      );
      scrollContainer.scrollLeft = cachedPanelWidthPx + newScrollLeftContent;
      const rulerW = container.querySelector('#ar-timeline-width') as HTMLInputElement;
      if (rulerW) rulerW.value = String(timelinePxPerSec);
      requestAnimationFrame(updateUI);
    }
    const timelineWidthInput = container.querySelector('#ar-timeline-width') as HTMLInputElement;
    if (timelineWidthInput) {
      timelineWidthInput.value = String(timelinePxPerSec);
      timelineWidthInput.addEventListener('input', () => applyTimelineWidthZoom(Number(timelineWidthInput.value) || PX_PER_SEC_MIN));
    }
    const inputTrigger = container.querySelector('#ar-input-trigger');
    inputTrigger?.addEventListener('click', () => openSettingsModal());
    inputTrigger?.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        e.preventDefault();
        openSettingsModal();
      }
    });
  }

  function bindTrackStrip(el: HTMLElement) {
    const rawId = el.dataset.trackId ?? el.querySelector('.ar-arm')?.getAttribute('data-id');
    const id = Number(rawId);
    if (Number.isNaN(id)) return;
    el.querySelectorAll('.ar-arm').forEach((btn) => btn.addEventListener('click', () => engine.toggleArm(id)));
    el.querySelectorAll('.ar-solo').forEach((btn) => btn.addEventListener('click', () => engine.toggleSolo(id)));
    el.querySelectorAll('.ar-mute').forEach((btn) => btn.addEventListener('click', () => engine.toggleMute(id)));
    el.querySelectorAll('.ar-input-monitor-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openInputMonitorMenu(id, btn as HTMLElement);
      });
    });
    el.querySelector('.ar-clear')?.addEventListener('click', () => engine.clearTrack(id));
    const nameInput = el.querySelector('.ar-track-name') as HTMLInputElement;
    nameInput?.addEventListener('change', () => engine.setTrackName(id, nameInput.value.trim() || `Track ${id + 1}`));
    const vol = el.querySelector('.ar-volume') as HTMLInputElement;
    vol?.addEventListener('input', () => engine.setVolume(id, Number(vol.value)));
    const pan = el.querySelector('.ar-pan') as HTMLInputElement;
    pan?.addEventListener('input', () => engine.setPan(id, Number(pan.value)));
    const reverb = el.querySelector('.ar-reverb') as HTMLInputElement;
    reverb?.addEventListener('input', () => engine.setReverb(id, Number(reverb.value)));
    const delay = el.querySelector('.ar-delay') as HTMLInputElement;
    delay?.addEventListener('input', () => engine.setDelay(id, Number(delay.value)));
    const compressor = el.querySelector('.ar-compressor') as HTMLInputElement;
    compressor?.addEventListener('input', () => engine.setCompressor(id, Number(compressor.value)));
  }

  const FADE_CORNER_HIT_PX = 8;
  const TRIM_HANDLE_PX = 40;
  type RegionZone = 'body' | 'trimLeft' | 'trimRight' | 'fadeLeft' | 'fadeRight';
  type WaveformHit =
    | { trackId: number; region: { id: string; startTime: number; duration: number }; zone: RegionZone }
    | null;
  function hitTestWaveform(wrap: HTMLDivElement, clientX: number, clientY: number): WaveformHit {
    const canvas = wrap.querySelector('canvas');
    let rect = canvas ? canvas.getBoundingClientRect() : wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) rect = wrap.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    const tf = buildTransform();
    const time = viewportXToTime(clickX, tf);
    const trackIdStr = wrap.closest('[data-track-id]')?.getAttribute('data-track-id');
    if (trackIdStr == null) return null;
    const trackId = Number(trackIdStr);
    const track = engine.getState().tracks.find((t) => t.id === trackId);
    if (!track?.regions.length) return null;
    const region = track.regions.find((r) => time >= r.startTime && time < r.startTime + r.duration);
    if (!region) return null;
    const leftViewportX = region.startTime * tf.pxPerSec - tf.scrollLeft;
    const rightViewportX = (region.startTime + region.duration) * tf.pxPerSec - tf.scrollLeft;
    const useContentX = rect.width > tf.viewportWidth + 2;
    const leftEdgeX = useContentX ? region.startTime * tf.pxPerSec : leftViewportX;
    const rightEdgeX = useContentX ? (region.startTime + region.duration) * tf.pxPerSec : rightViewportX;
    const h = rect.height;
    const midY = h / 2;
    const inBottomHalf = clickY >= midY;
    if (inBottomHalf) {
      if (clickX >= leftEdgeX - 1 && clickX < leftEdgeX + TRIM_HANDLE_PX)
        return { trackId, region, zone: 'trimLeft' };
      if (clickX >= rightEdgeX - TRIM_HANDLE_PX && clickX < rightEdgeX + 1)
        return { trackId, region, zone: 'trimRight' };
      return { trackId, region, zone: 'body' };
    }
    const fromStart = time - region.startTime;
    const fromEnd = region.startTime + region.duration - time;
    const distLeftPx = fromStart * tf.pxPerSec;
    const distRightPx = fromEnd * tf.pxPerSec;
    if (distLeftPx < FADE_CORNER_HIT_PX) return { trackId, region, zone: 'fadeLeft' };
    if (distRightPx < FADE_CORNER_HIT_PX) return { trackId, region, zone: 'fadeRight' };
    return { trackId, region, zone: 'body' };
  }

  function showRegionContextMenu(clientX: number, clientY: number, hit: NonNullable<WaveformHit>) {
    const menu = document.createElement('div');
    menu.className = 'ar-region-menu fixed z-[100] min-w-[140px] rounded border border-border bg-card py-1 shadow-lg';
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    const state = engine.getState();
    const playheadInRegion =
      state.currentTime >= hit.region.startTime &&
      state.currentTime < hit.region.startTime + hit.region.duration;
    const regionMuted = engine.getState().tracks.find((t) => t.id === hit.trackId)?.regions.find((r) => r.id === hit.region.id)?.muted ?? false;

    const btn = (label: string, disabled: boolean, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ar-region-menu-btn w-full px-3 py-1.5 text-left text-sm hover:bg-secondary disabled:opacity-50 disabled:pointer-events-none';
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener('click', () => {
        fn();
        close();
      });
      return b;
    };
    menu.appendChild(btn('Split at playhead', !playheadInRegion, () => engine.splitRegionAtPlayhead(hit.trackId, hit.region.id)));
    menu.appendChild(btn('Duplicate', false, () => engine.duplicateRegion(hit.trackId, hit.region.id)));
    menu.appendChild(btn('Delete', false, () => engine.deleteRegion(hit.trackId, hit.region.id)));
    menu.appendChild(btn(regionMuted ? 'Unmute' : 'Mute', false, () => engine.toggleRegionMute(hit.trackId, hit.region.id)));
    const close = () => {
      menu.remove();
      document.removeEventListener('click', close);
      requestAnimationFrame(updateUI);
    };
    document.addEventListener('click', close);
    container.appendChild(menu);
  }

  const MIN_REGION_DURATION_SEC = 0.1;

  function bindWaveformSeek(wrap: HTMLDivElement) {
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressPointerId: number | null = null;
    let longPressHandled = false;
    let dragHandled = false;
    let lastPointerXY = { x: 0, y: 0 };
    let moveDrag: { trackId: number; regionId: string; startPointerX: number; startStartTime: number } | null = null;
    let trimLeftDrag: { trackId: number; regionId: string } | null = null;
    let trimRightDrag: { trackId: number; regionId: string } | null = null;
    let fadeDrag: { trackId: number; regionId: string; kind: 'fadeIn' | 'fadeOut' } | null = null;

    wrap.addEventListener('contextmenu', (e: Event) => {
      const ev = e as MouseEvent;
      const hit = hitTestWaveform(wrap, ev.clientX, ev.clientY);
      if (hit) {
        e.preventDefault();
        showRegionContextMenu(ev.clientX, ev.clientY, hit);
      }
    });

    const onPointerMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const tf = buildTransform();
      const time = viewportXToTime(clickX, tf);
      const state = engine.getState();
      const snap = (t: number) => snapTimeToGrid(t, state.tempo, state.timeSignature, snapSetting, tf);

      if (moveDrag) {
        const startTimeAtPointer = viewportXToTime(moveDrag.startPointerX - rect.left, tf);
        const deltaTime = time - startTimeAtPointer;
        const newStart = snap(moveDrag.startStartTime + deltaTime);
        const track = state.tracks.find((t) => t.id === moveDrag!.trackId);
        const region = track?.regions.find((r) => r.id === moveDrag!.regionId);
        if (region) engine.moveRegion(moveDrag.trackId, moveDrag.regionId, newStart);
        requestAnimationFrame(updateUI);
        return;
      }
      if (trimLeftDrag) {
        const track = state.tracks.find((t) => t.id === trimLeftDrag!.trackId);
        const region = track?.regions.find((r) => r.id === trimLeftDrag!.regionId);
        if (region) {
          const endTime = region.startTime + region.duration;
          const minStart = Math.max(0, region.startTime - region.sourceOffset);
          const maxStart = endTime - MIN_REGION_DURATION_SEC;
          const newStart = Math.max(minStart, Math.min(maxStart, snap(time)));
          engine.trimRegionLeft(trimLeftDrag.trackId, trimLeftDrag.regionId, newStart);
        }
        requestAnimationFrame(updateUI);
        return;
      }
      if (trimRightDrag) {
        const track = state.tracks.find((t) => t.id === trimRightDrag!.trackId);
        const region = track?.regions.find((r) => r.id === trimRightDrag!.regionId);
        if (region) {
          const minEnd = region.startTime + MIN_REGION_DURATION_SEC;
          const maxEnd = region.startTime + (region.audioBuffer.duration - region.sourceOffset);
          const newEnd = Math.max(minEnd, Math.min(maxEnd, snap(time)));
          engine.trimRegionRight(trimRightDrag.trackId, trimRightDrag.regionId, newEnd);
        }
        requestAnimationFrame(updateUI);
        return;
      }
      if (fadeDrag) {
        const track = state.tracks.find((t) => t.id === fadeDrag!.trackId);
        const region = track?.regions.find((r) => r.id === fadeDrag!.regionId);
        if (!region) return;
        const maxFade = region.duration / 2;
        const snappedTime = snap(time);
        if (fadeDrag.kind === 'fadeIn') {
          const sec = Math.max(0, Math.min(maxFade, snappedTime - region.startTime));
          engine.setRegionFadeIn(fadeDrag.trackId, fadeDrag.regionId, sec);
        } else {
          const sec = Math.max(0, Math.min(maxFade, region.startTime + region.duration - snappedTime));
          engine.setRegionFadeOut(fadeDrag.trackId, fadeDrag.regionId, sec);
        }
        requestAnimationFrame(updateUI);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (moveDrag || trimLeftDrag || trimRightDrag || fadeDrag) {
        dragHandled = true;
        engine.endUndoableBatch();
        moveDrag = null;
        trimLeftDrag = null;
        trimRightDrag = null;
        fadeDrag = null;
        try {
          wrap.releasePointerCapture(e.pointerId);
        } catch {}
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        return;
      }
      clearLongPress();
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
    const clearLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      document.removeEventListener('pointerup', clearLongPress);
      document.removeEventListener('pointercancel', clearLongPress);
      document.removeEventListener('pointermove', clearLongPress);
      if (longPressPointerId !== null) {
        try {
          wrap.releasePointerCapture(longPressPointerId);
        } catch {}
        longPressPointerId = null;
      }
    };

    wrap.addEventListener('pointerdown', (e: PointerEvent) => {
      lastPointerXY = { x: e.clientX, y: e.clientY };
      const hit = hitTestWaveform(wrap, e.clientX, e.clientY);

      if (hit?.zone === 'body') {
        e.preventDefault();
        engine.startUndoableBatch();
        moveDrag = {
          trackId: hit.trackId,
          regionId: hit.region.id,
          startPointerX: e.clientX,
          startStartTime: hit.region.startTime,
        };
        wrap.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        return;
      }
      if (hit?.zone === 'trimLeft') {
        e.preventDefault();
        engine.startUndoableBatch();
        trimLeftDrag = { trackId: hit.trackId, regionId: hit.region.id };
        wrap.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        return;
      }
      if (hit?.zone === 'trimRight') {
        e.preventDefault();
        engine.startUndoableBatch();
        trimRightDrag = { trackId: hit.trackId, regionId: hit.region.id };
        wrap.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        return;
      }
      if (hit?.zone === 'fadeLeft' || hit?.zone === 'fadeRight') {
        e.preventDefault();
        engine.startUndoableBatch();
        fadeDrag = {
          trackId: hit.trackId,
          regionId: hit.region.id,
          kind: hit.zone === 'fadeLeft' ? 'fadeIn' : 'fadeOut',
        };
        wrap.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        return;
      }
      if (hit) {
        e.preventDefault();
        longPressPointerId = e.pointerId;
        wrap.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', clearLongPress);
      }
      longPressHandled = false;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (hit) {
          longPressHandled = true;
          showRegionContextMenu(lastPointerXY.x, lastPointerXY.y, hit);
        }
      }, 500);
      document.addEventListener('pointerup', clearLongPress);
      document.addEventListener('pointercancel', clearLongPress);
    });
    wrap.addEventListener('pointerup', () => {
      if (!moveDrag && !trimLeftDrag && !trimRightDrag && !fadeDrag) clearLongPress();
    });
    wrap.addEventListener('pointercancel', clearLongPress);

    wrap.addEventListener('mousemove', (e: MouseEvent) => {
      if (moveDrag) {
        wrap.style.cursor = 'grabbing';
        return;
      }
      const hit = hitTestWaveform(wrap, e.clientX, e.clientY);
      if (!hit) {
        wrap.style.cursor = 'pointer';
        return;
      }
      if (hit.zone === 'body') wrap.style.cursor = 'grab';
      else if (hit.zone === 'trimLeft' || hit.zone === 'trimRight' || hit.zone === 'fadeLeft' || hit.zone === 'fadeRight')
        wrap.style.cursor = 'ew-resize';
      else wrap.style.cursor = 'pointer';
    });
    wrap.addEventListener('mouseleave', () => {
      wrap.style.cursor = '';
    });
    wrap.addEventListener('click', (e: MouseEvent) => {
      if (longPressHandled) {
        longPressHandled = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (dragHandled) {
        dragHandled = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const state = engine.getState();
      if (state.duration <= 0) return;
      const rect = wrap.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const tf = buildTransform();
      const time = viewportXToTime(clickX, tf);
      engine.seekTo(Math.max(0, Math.min(time, state.duration)));
    });
  }

  function bindTracks() {
    container.querySelectorAll('.ar-track-panel[data-track-id]').forEach((panel) => {
      bindTrackStrip(panel as HTMLDivElement);
    });
    trackStripRefs.forEach((ref) => bindWaveformSeek(ref.waveformWrap));
  }

  const TRAIL_OPACITIES = [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12, 0.07, 0.04, 0.02];

  /** Orange (accent) and green (meter) for blend; green at wall (position 0 or 1), orange in middle. */
  const VISUAL_METRO_ORANGE = { r: 246, g: 153, b: 44 };
  const VISUAL_METRO_GREEN = { r: 34, g: 197, b: 94 };
  function visualMetroColor(position: number): string {
    const blend = Math.max(0, Math.min(1, 1 - 4 * position * (1 - position)));
    const r = Math.round(VISUAL_METRO_ORANGE.r * (1 - blend) + VISUAL_METRO_GREEN.r * blend);
    const g = Math.round(VISUAL_METRO_ORANGE.g * (1 - blend) + VISUAL_METRO_GREEN.g * blend);
    const b = Math.round(VISUAL_METRO_ORANGE.b * (1 - blend) + VISUAL_METRO_GREEN.b * blend);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function clearVisualMetro() {
    const segs = visualMetroTrack.querySelectorAll('.ar-visual-metro-seg');
    segs.forEach((el) => {
      const h = el as HTMLElement;
      h.style.backgroundColor = '';
      h.style.boxShadow = '';
      h.style.opacity = '';
    });
  }

  let visualMetroRafId: number | null = null;
  let beatStartTime = 0;
  let visualMetroDirection = 1; // 1 = moving right (0→1), -1 = moving left (1→0)

  function tickVisualMetro() {
    const s = engine.getState();
    const active = s.isPlaying || s.isRecording || s.isCountingIn;
    if (!active) {
      clearVisualMetro();
      visualMetroRafId = null;
      return;
    }
    const beatDurationMs = (60 / s.tempo) * 1000;
    const now = performance.now();
    const elapsed = now - beatStartTime;
    let phase = elapsed / beatDurationMs;
    if (phase >= 1) {
      beatStartTime = now;
      visualMetroDirection *= -1;
      phase = 0;
    }
    const position = visualMetroDirection === 1 ? phase : 1 - phase;
    const N = VISUAL_METRO_SEGMENTS;
    const headPos = position * (N - 1);
    const headIdx = Math.round(headPos);
    const segColor = visualMetroColor(position);
    const segs = visualMetroTrack.querySelectorAll('.ar-visual-metro-seg');
    for (let i = 0; i < N; i++) {
      const el = segs[i] as HTMLElement;
      const distFromHead = visualMetroDirection === 1 ? headIdx - i : i - headIdx;
      let opacity = 0;
      if (distFromHead === 0) opacity = 1;
      else if (distFromHead > 0 && distFromHead <= VISUAL_METRO_TRAIL) opacity = TRAIL_OPACITIES[distFromHead - 1] ?? 0;
      if (opacity > 0) {
        el.style.backgroundColor = segColor;
        el.style.boxShadow = `0 0 4px ${segColor}`;
        el.style.opacity = String(opacity);
      } else {
        el.style.backgroundColor = '';
        el.style.boxShadow = '';
        el.style.opacity = '';
      }
    }
    visualMetroRafId = requestAnimationFrame(tickVisualMetro);
  }

  function attachVisualMetro() {
    const s = engine.getState();
    const active = s.isPlaying || s.isRecording || s.isCountingIn;
    if (active && !visualMetroRafId) {
      beatStartTime = performance.now();
      visualMetroDirection = 1;
      visualMetroRafId = requestAnimationFrame(tickVisualMetro);
    } else if (!active && visualMetroRafId) {
      cancelAnimationFrame(visualMetroRafId);
      visualMetroRafId = null;
      clearVisualMetro();
    }
  }

  let wasTransportActive = false;
  let updateUIScheduled = false;
  const unsub = engine.subscribe(() => {
    const state = engine.getState();
    const isActive = state.isPlaying || state.isRecording || state.isCountingIn;
    const justStopped = wasTransportActive && !isActive;
    wasTransportActive = isActive;

    // Coalesce updateUI to at most once per animation frame to avoid forced reflow violations (layout read/write storm at 60fps).
    if (!updateUIScheduled) {
      updateUIScheduled = true;
      requestAnimationFrame(() => {
        updateUIScheduled = false;
        updateUI();
        attachVisualMetro();
      });
    }

    // When we transition from playing/recording/count-in to stopped: only scroll timeline to start when we actually stopped (position 0), not when we paused (position kept).
    // On pause, keep the current scroll so the waveform stays at the playhead; on stop, scroll to start and move focus.
    if (justStopped && state.currentTime === 0 && state.startPosition === 0) {
      scrollTimelineToStart();
      (document.activeElement as HTMLElement)?.blur();
      const moveFocusToTimeline = () =>
        container.querySelector<HTMLElement>('#ar-ruler')?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateUI();
          moveFocusToTimeline();
        });
        setTimeout(moveFocusToTimeline, 80);
      });
    }
  });

  cleanupFns.push(unsub);
  const unsubInputLevel = engine.subscribeInputLevel((level) => {
    const isRecording = engine.getState().isRecording;
    const inputMeter = container.querySelector('#ar-input-meter') as HTMLElement | null;
    if (inputMeter) updateLedGridMeter(inputMeter, level, LEVEL_METER_SEGMENTS);
    const masterMeter = container.querySelector('#ar-master-meter') as HTMLElement | null;
    if (masterMeter) updateLedGridMeter(masterMeter, isRecording ? level * 0.8 : 0, LEVEL_METER_SEGMENTS);
    const masterDb = container.querySelector('#ar-master-db');
    if (masterDb) masterDb.textContent = isRecording ? `${Math.round(level * -60)}dB` : '-inf';
  });
  cleanupFns.push(unsubInputLevel);
  buildTrackStrips();
  requestAnimationFrame(() => refreshPanelWidth());

  /**
   * Align to bar 1: timeline content scroll offset 0 in buildTransform().
   * Use scrollLeft = 0 on both scrollers (not cachedPanelWidthPx): for scrollLeftFull in [0, W],
   * scrollLeftContent stays 0, and this is the minimum scroll — avoids ending up ~6 bars right
   * after layout/modals (observed: ruler at 7 while transport shows 1.1).
   * During play / zoom, code still sets scrollLeft = cachedPanelWidthPx + contentOffset as before.
   */
  function scrollTimelineToStart(): void {
    refreshPanelWidth();
    const apply = (left: number) => {
      scrollContainer.scrollTo({ left, behavior: 'instant' });
      hScrollStrip.scrollTo({ left, behavior: 'instant' });
    };
    apply(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refreshPanelWidth();
        const tf = buildTransform();
        if (tf.scrollLeft > 2) {
          apply(0);
          requestAnimationFrame(updateUI);
        }
      });
    });
  }

  /** After overlays close, layout can restore a large scrollLeft; re-apply home scroll a few times. */
  function scheduleScrollHomeAfterModalClose(): void {
    if (!container.isConnected) return;
    const run = () => {
      if (!container.isConnected) return;
      scrollTimelineToStart();
      requestAnimationFrame(updateUI);
    };
    run();
    setTimeout(run, 0);
    setTimeout(run, 120);
    setTimeout(run, 450);
  }

  const mountAtMs = Date.now();
  let resizeScrollFixTimeout: ReturnType<typeof setTimeout> | null = null;
  const resizeObserver = new ResizeObserver(() => {
    syncTrackHeights();
    refreshPanelWidth();
    /* When timeline width changes (zoom, min duration, waveform decode), layout can shift horizontal scroll away from bar 1. */
    if (resizeScrollFixTimeout != null) clearTimeout(resizeScrollFixTimeout);
    resizeScrollFixTimeout = setTimeout(() => {
      resizeScrollFixTimeout = null;
      const state = engine.getState();
      if (state.isPlaying || state.isRecording || state.isCountingIn) return;
      if (state.currentTime > 0.01 || state.startPosition > 0) return;
      if (Date.now() - mountAtMs > 25000) return;
      const tf = buildTransform();
      if (tf.scrollLeft > 8 && tf.scrollLeft < scrollContainer.clientWidth * 2) {
        scrollTimelineToStart();
        requestAnimationFrame(updateUI);
      }
    }, 80);
  });
  resizeObserver.observe(scrollContainer);
  resizeObserver.observe(timelineContent);
  cleanupFns.push(() => {
    if (resizeScrollFixTimeout != null) clearTimeout(resizeScrollFixTimeout);
    resizeObserver.disconnect();
  });
  const onWindowResize = () => syncTrackHeights();
  window.addEventListener('resize', onWindowResize);
  cleanupFns.push(() => window.removeEventListener('resize', onWindowResize));
  bindTransport();
  const handleDocumentKeydown = (e: KeyboardEvent) => {
    if (!container.isConnected) return;
    const target = e.target as HTMLElement;
    const inInput = target.closest('input, textarea, select') || (target.isContentEditable && target.getAttribute('contenteditable') === 'true');
    const inContainer = container.contains(target) || target === document.body || target === document.documentElement;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && inContainer && !inInput) {
      if (e.key === 'z' || e.key === 'y') {
        if (e.shiftKey && e.key.toLowerCase() === 'z') {
          if (engine.getState().canRedo) {
            e.preventDefault();
            engine.redo();
          }
          return;
        }
        if (e.key === 'z' && !e.shiftKey) {
          if (engine.getState().canUndo) {
            e.preventDefault();
            engine.undo();
          }
          return;
        }
        if (e.key === 'y' && !e.shiftKey) {
          if (engine.getState().canRedo) {
            e.preventDefault();
            engine.redo();
          }
          return;
        }
      }
    }

    if (e.key !== ' ') return;
    if (inInput) return;
    if (!inContainer) return;
    e.preventDefault();
    const s = engine.getState();
    // Space = full stop (rewind, end recording), not pause — matches hardware transport expectations in Track Lab.
    if (s.isPlaying || s.isRecording || s.isCountingIn) engine.stop();
    else engine.play();
  };
  document.addEventListener('keydown', handleDocumentKeydown, true);
  cleanupFns.push(() => document.removeEventListener('keydown', handleDocumentKeydown, true));
  bindTracks();
  updateUI();

  // Warm up: put playhead at 0, scroll timeline to start, focus ruler so Play button / Space (stop or play) and zoom work immediately
  const focusTimeline = () => container.querySelector<HTMLElement>('#ar-ruler')?.focus({ preventScroll: true });
  const scrollToStartAndFocus = () => {
    scrollTimelineToStart();
    focusTimeline();
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(scrollToStartAndFocus);
    setTimeout(scrollToStartAndFocus, 100);
    setTimeout(scrollToStartAndFocus, 280);
    setTimeout(scrollToStartAndFocus, 600);
    /* Latency → Settings modals run after mount; layout can leave horizontal scroll mid-timeline (~bar 7). */
    setTimeout(() => scheduleScrollHomeAfterModalClose(), 2200);
    setTimeout(() => scheduleScrollHomeAfterModalClose(), 4800);
  });

  engine.startSustainedInputStream().catch(() => {});
  setTimeout(() => {
    _dbg(0, 'onLoad:openLatencyCalibrationModal', 'load');
    openLatencyCalibrationModal();
  }, 0);

  // Load initial recordings (from saved project or song) and apply project settings
  (async () => {
    const { initialRecordings: recs, initialProjectData: projData } = currentProps;
    if (projData) {
      engine.setTempo(projData.tempo);
      engine.setTimeSignature(projData.timeSignature[0], projData.timeSignature[1]);
      const tempoInput = container.querySelector('#ar-tempo') as HTMLInputElement;
      if (tempoInput) tempoInput.value = String(projData.tempo);
      const tsNum = container.querySelector('#ar-time-sig-num') as HTMLElement;
      const tsDen = container.querySelector('#ar-time-sig-den') as HTMLElement;
      if (tsNum) tsNum.textContent = String(projData.timeSignature[0]);
      if (tsDen) tsDen.textContent = String(projData.timeSignature[1]);
      projData.tracks.forEach((t) => {
        engine.setTrackName(t.trackIndex, t.name);
        engine.setVolume(t.trackIndex, t.volume);
        engine.setPan(t.trackIndex, t.pan);
        engine.setReverb(t.trackIndex, t.reverb);
        engine.setDelay(t.trackIndex, t.delay ?? 0);
        engine.setCompressor(t.trackIndex, t.compressor ?? 0);
        engine.setInputMonitoring(t.trackIndex, t.inputMonitoring ?? 'off');
        engine.setMuted(t.trackIndex, t.muted);
        engine.setSolo(t.trackIndex, t.solo);
      });
      if (projData.masterEffects) {
        const e = projData.masterEffects;
        engine.setAuxLevel(e.reverbLevel);
        engine.setAuxMuted(e.reverbMuted);
        if (e.reverbPreDelayMs != null) engine.setReverbPreDelayMs(e.reverbPreDelayMs);
        if (e.reverbBandwidth != null) engine.setReverbBandwidth(e.reverbBandwidth);
        if (e.reverbInputDiffusion1 != null) engine.setReverbInputDiffusion1(e.reverbInputDiffusion1);
        if (e.reverbInputDiffusion2 != null) engine.setReverbInputDiffusion2(e.reverbInputDiffusion2);
        if (e.reverbDecay != null) engine.setReverbDecay(e.reverbDecay);
        if (e.reverbDecayDiffusion1 != null) engine.setReverbDecayDiffusion1(e.reverbDecayDiffusion1);
        if (e.reverbDecayDiffusion2 != null) engine.setReverbDecayDiffusion2(e.reverbDecayDiffusion2);
        if (e.reverbDamping != null) engine.setReverbDamping(e.reverbDamping);
        if (e.reverbExcursionRate != null) engine.setReverbExcursionRate(e.reverbExcursionRate);
        if (e.reverbExcursionDepth != null) engine.setReverbExcursionDepth(e.reverbExcursionDepth);
        if (e.reverbWet != null) engine.setReverbWet(e.reverbWet);
        if (e.reverbDry != null) engine.setReverbDry(e.reverbDry);
        engine.setDelayLevel(e.delayLevel);
        engine.setDelayMuted(e.delayMuted);
        engine.setDelayTimeMs(e.delayTimeMs);
        engine.setDelayFeedback(e.delayFeedback);
        engine.setDelayWet(e.delayWet);
        engine.setCompressorLevel(e.compressorLevel);
        engine.setCompressorMuted(e.compressorMuted);
        engine.setCompressorThreshold(e.compressorThreshold);
        engine.setCompressorKnee(e.compressorKnee);
        engine.setCompressorRatio(e.compressorRatio);
        engine.setCompressorAttack(e.compressorAttack);
        engine.setCompressorRelease(e.compressorRelease);
        engine.setCompressorEnabled(e.compressorEnabled);
      }
    }
    if (recs?.length) {
      // Use same auth as app (Clerk then JWT) so artifact fetch succeeds when not using legacy JWT
      let token: string | null = null;
      if (typeof window !== 'undefined') {
        try {
          const { getClerkToken } = await import('../clerkTokenProvider');
          token = await getClerkToken();
        } catch {
          /* Clerk not available */
        }
        token = token ?? localStorage.getItem('jwt');
      }
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      for (const r of recs) {
        try {
          const res = await fetch(r.playbackUrl, { headers });
          if (!res.ok) continue;
          const arrayBuffer = await res.arrayBuffer();
          await engine.loadRecordingFromArrayBuffer(r.trackIndex, arrayBuffer, r.label);
        } catch {
          /* ignore fetch/decode errors */
        }
      }
      engine.seekTo(0);
      scrollTimelineToStart();
      requestAnimationFrame(updateUI);
      focusTimeline();
      setTimeout(scrollTimelineToStart, 0);
      setTimeout(scrollTimelineToStart, 120);
    }
  })();

  // Apply app-wide output device preference (e.g. speaker on iOS) so Track Lab uses same sink as Chord Explorer
  import('../audioOutputDevice')
    .then(({ getStoredOutputDeviceId }) => getStoredOutputDeviceId())
    .then((deviceId) => {
      if (deviceId) engine.setOutputDevice(deviceId);
    })
    .catch(() => {});

  return {
    updateProps(nextProps: AudioRecorderProps) {
      currentProps = nextProps;
    },
    destroy() {
      cleanupFns.forEach((fn) => fn());
      if (visualMetroRafId != null) {
        cancelAnimationFrame(visualMetroRafId);
        visualMetroRafId = null;
      }
      engine.stopSustainedInputStream();
      engine.stop();
      container.innerHTML = '';
    },
    getState: () => engine.getState(),
    exportRecordings: () => engine.exportRecordings(),
    mixDown: () => engine.mixDown(),
  };
}
