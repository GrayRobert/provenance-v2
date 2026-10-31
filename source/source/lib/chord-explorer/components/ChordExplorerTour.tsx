'use client';

/**
 * Chord Explorer Tour - React step-by-step tour.
 * Replaces the vanilla Driver.js tour so "Don't show again" and persistence
 * live entirely in the React tree and use the same hook/API.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './chordExplorerTourReact.css';

const MODAL_SELECTOR = '.chord-explorer-modal';

function queryInModal(selector: string): Element | null {
  const modal = document.querySelector(MODAL_SELECTOR);
  return modal ? modal.querySelector(selector) : null;
}

function resolveTarget(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = queryInModal(sel);
    if (el) return el;
  }
  const modal = document.querySelector(MODAL_SELECTOR);
  return modal ?? document.body;
}

export interface TourStepDef {
  title: string;
  description: string;
  /** Selectors tried in order within the modal; last fallback is modal/body. */
  selectors: string[];
  side: 'top' | 'bottom' | 'left' | 'right';
  align: 'start' | 'center' | 'end';
  popoverClass?: string;
}

const TOUR_STEPS: TourStepDef[] = [
  {
    title: 'Welcome to Chord Explorer',
    description: 'This quick tour will show you the main areas.',
    selectors: ['.brand', '.chord-explorer-modal'],
    side: 'bottom',
    align: 'center',
    popoverClass: 'chord-explorer-tour-popover-welcome',
  },
  {
    title: 'Root & Tonality',
    description:
      'Set the key for the chord palette. Root chooses the starting note (e.g. C, G), and Tonality sets Major or Minor. The chord palette updates automatically.',
    selectors: ['[data-tour="root-tonality"]'],
    side: 'bottom',
    align: 'start',
  },
  {
    title: 'Instrument',
    description:
      'Choose your sound: Grand Piano, Rhodes, or Acoustic Guitar. Each instrument has a distinct character for chord playback.',
    selectors: ['[data-tour="instrument"]'],
    side: 'bottom',
    align: 'start',
  },
  {
    title: 'Playback Style',
    description:
      'Choose how chords are played: Block Chords, Arpeggiated, and other styles. This affects the rhythm and feel when chords sound.',
    selectors: ['[data-tour="style"]'],
    side: 'bottom',
    align: 'start',
  },
  {
    title: 'Time & Tempo',
    description:
      'Time signature (e.g. 4/4) and tempo (BPM) for playback. Use +/− to adjust the tempo.',
    selectors: ['[data-tour="time-tempo"]'],
    side: 'bottom',
    align: 'start',
  },
  {
    title: 'Metronome',
    description:
      'Tap to open metronome settings. Choose the sound type (Thump, Wood, Finger snap), adjust volume, or mute the metronome during playback.',
    selectors: ['[data-tour="metronome"]'],
    side: 'bottom',
    align: 'start',
  },
  {
    title: 'SUS (Sustain)',
    description:
      'Sustain holds the chord after release so notes keep ringing. Turn off for short, staccato-style chords.',
    selectors: ['#sustain-toggle', '#mobile-sustain-toggle'],
    side: 'left',
    align: 'center',
  },
  {
    title: 'ROOT',
    description:
      'ROOT forces the bass note to always be the root, regardless of chord inversion. Turn off to hear strict chord inversions.',
    selectors: ['#root-bass-toggle', '#mobile-root-bass-toggle'],
    side: 'left',
    align: 'center',
  },
  {
    title: 'Humanise',
    description:
      'Turn off for perfect, metronomic timing. Leave on for more expressive nuance and natural feel.',
    selectors: ['#humanise-toggle', '#mobile-humanise-toggle'],
    side: 'left',
    align: 'center',
  },
  {
    title: 'Inversion',
    description:
      'Cycles through chord inversions (root position, 1st, 2nd, etc.). Turn ROOT off for strict chord inversion.',
    selectors: ['#inversion-button', '#mobile-inversion-button'],
    side: 'left',
    align: 'center',
  },
  {
    title: 'Chord Palette',
    description:
      'Diatonic chords organized by scale degree (I, ii, iii, etc.). Click a chord to play it. Drag or double click to add chords to the timeline below. Long press to drag or double tap on touch screen devices.',
    selectors: ['[data-tour="diatonic-chords"]'],
    side: 'top',
    align: 'start',
  },
  {
    title: 'Modal Interchange',
    description:
      'Borrowed chords from parallel modes (e.g. bVII, iv in major). Use the Safe ↔ Bold slider to control how many suggestions appear. Higher boldness shows more adventurous chords.',
    selectors: ['[data-tour="modal-interchange"]', '.borrowed-section', '#chord-palette'],
    side: 'top',
    align: 'start',
  },
  {
    title: 'Custom Chords',
    description:
      'Add your own chord symbols (e.g. Em, Cmaj7). Enter a chord symbol and click ADD to include it in your palette.',
    selectors: ['[data-tour="custom-chords"]'],
    side: 'top',
    align: 'start',
  },
  {
    title: 'Progression Player',
    description:
      'Play, Stop, Clear, and Save your progression. The timeline loops from the end back to the start. Select a chord from the palette, then click Insert to add it to the timeline.',
    selectors: ['[data-tour="transport-bar"]'],
    side: 'top',
    align: 'center',
  },
  {
    title: 'Pre-built Progressions',
    description:
      'Click "Add" at the end of the timeline to open the Chord Progressions library. Choose a progression (e.g. I–V–vi–IV) to append to your timeline. Progressions are filtered by your current key.',
    selectors: ['[data-tour="add-progression"]', '#timeline-container', '[data-tour="transport-bar"]'],
    side: 'top',
    align: 'center',
  },
];

export type TourCompleteReason = 'completed' | 'dismissed';

export interface ChordExplorerTourProps {
  /** When true, the tour overlay and current step are shown. */
  isActive: boolean;
  /** Called when the tour ends. reason: 'completed' = user clicked Done on last step; 'dismissed' = closed without completing. */
  onComplete: (reason?: TourCompleteReason) => void;
  /** Called when user clicks "Don't show again". Caller should persist and close the tour. */
  onSkipPermanent: () => void;
}

const POPOVER_OFFSET = 24;

function getPopoverPosition(
  targetRect: DOMRect,
  side: TourStepDef['side'],
  align: TourStepDef['align'],
  popoverWidth: number,
  popoverHeight: number
): { top: number; left: number } {
  const viewportPadding = 16;
  let top = 0;
  let left = 0;

  switch (side) {
    case 'bottom':
      top = targetRect.bottom + POPOVER_OFFSET;
      left =
        align === 'center'
          ? targetRect.left + targetRect.width / 2 - popoverWidth / 2
          : align === 'end'
            ? targetRect.right - popoverWidth
            : targetRect.left;
      break;
    case 'top':
      top = targetRect.top - popoverHeight - POPOVER_OFFSET;
      left =
        align === 'center'
          ? targetRect.left + targetRect.width / 2 - popoverWidth / 2
          : align === 'end'
            ? targetRect.right - popoverWidth
            : targetRect.left;
      break;
    case 'left':
      left = targetRect.left - popoverWidth - POPOVER_OFFSET;
      top =
        align === 'center'
          ? targetRect.top + targetRect.height / 2 - popoverHeight / 2
          : align === 'end'
            ? targetRect.bottom - popoverHeight
            : targetRect.top;
      break;
    case 'right':
      left = targetRect.right + POPOVER_OFFSET;
      top =
        align === 'center'
          ? targetRect.top + targetRect.height / 2 - popoverHeight / 2
          : align === 'end'
            ? targetRect.bottom - popoverHeight
            : targetRect.top;
      break;
  }

  // Clamp to viewport
  const maxLeft = window.innerWidth - popoverWidth - viewportPadding;
  const maxTop = window.innerHeight - popoverHeight - viewportPadding;
  left = Math.max(viewportPadding, Math.min(left, maxLeft));
  top = Math.max(viewportPadding, Math.min(top, maxTop));

  return { top, left };
}

export default function ChordExplorerTour({
  isActive,
  onComplete,
  onSkipPermanent,
}: ChordExplorerTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef<Element | null>(null);

  const totalSteps = TOUR_STEPS.length;
  const currentStep = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  const updatePosition = useCallback(() => {
    if (!currentStep || !popoverRef.current) return;
    const target = resolveTarget(currentStep.selectors);
    highlightedRef.current = target;
    if (!target || target === document.body) {
      setPopoverStyle(null);
      return;
    }
    target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect();
      const w = popoverRect?.width ?? 320;
      const h = popoverRect?.height ?? 200;
      setPopoverStyle(
        getPopoverPosition(rect, currentStep.side, currentStep.align, w, h)
      );
    });
  }, [currentStep]);

  useEffect(() => {
    if (!isActive || !currentStep) return;
    updatePosition();
    const modal = document.querySelector(MODAL_SELECTOR);
    if (!modal) return;
    const ro = new ResizeObserver(updatePosition);
    ro.observe(modal);
    return () => ro.disconnect();
  }, [isActive, stepIndex, currentStep, updatePosition]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete('completed');
      return;
    }
    setStepIndex((i) => i + 1);
  }, [isLast, onComplete]);

  const handleBack = useCallback(() => {
    if (isFirst) return;
    setStepIndex((i) => i - 1);
  }, [isFirst]);

  const handleClose = useCallback(() => {
    onComplete('dismissed');
  }, [onComplete]);

  const handleDontShowAgain = useCallback(() => {
    onSkipPermanent();
    onComplete('dismissed');
  }, [onSkipPermanent, onComplete]);

  if (!isActive || totalSteps === 0) return null;

  return (
    <div className="chord-explorer-tour" role="dialog" aria-modal="true" aria-label="Chord Explorer tour">
      <div
        className="chord-explorer-tour-overlay"
        onClick={handleClose}
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
        aria-hidden
      />
      <div
        ref={popoverRef}
        className={`chord-explorer-tour-popover ${currentStep?.popoverClass ?? ''}`}
        style={
          popoverStyle
            ? { position: 'fixed', top: popoverStyle.top, left: popoverStyle.left }
            : {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }
        }
        role="region"
        aria-label={`Step ${stepIndex + 1} of ${totalSteps}: ${currentStep?.title}`}
      >
        <button
          type="button"
          className="chord-explorer-tour-close"
          aria-label="Close tour"
          onClick={handleClose}
        >
          ×
        </button>
        <h3 className="chord-explorer-tour-title">{currentStep?.title}</h3>
        <p className="chord-explorer-tour-description">{currentStep?.description}</p>
        <div className="chord-explorer-tour-footer">
          <span className="chord-explorer-tour-progress" aria-live="polite">
            {stepIndex + 1} of {totalSteps}
          </span>
          <div className="chord-explorer-tour-nav">
            <button
              type="button"
              className="chord-explorer-tour-btn chord-explorer-tour-prev"
              onClick={handleBack}
              disabled={isFirst}
              aria-label="Previous step"
            >
              Back
            </button>
            <button
              type="button"
              className="chord-explorer-tour-btn chord-explorer-tour-next"
              onClick={handleNext}
              aria-label={isLast ? 'Finish tour' : 'Next step'}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
          <div className="chord-explorer-tour-footer-row">
            <button
              type="button"
              className="chord-explorer-tour-footer-link"
              onClick={handleClose}
            >
              Skip tutorial
            </button>
            <span className="chord-explorer-tour-footer-link-sep" aria-hidden> · </span>
            <button
              type="button"
              className="chord-explorer-tour-footer-link"
              onClick={handleDontShowAgain}
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
