'use client';

/**
 * Chord Builder Tour - React step-by-step tour.
 * Steps are shown centre-screen. Same pattern as Chord Explorer: "Don't show again" and persistence.
 */

import React, { useCallback, useState } from 'react';
import '@/lib/chord-explorer/components/chordExplorerTourReact.css';

interface TourStepDef {
  title: string;
  description: string;
  popoverClass?: string;
}

const TOUR_STEPS: TourStepDef[] = [
  {
    title: 'Chord Builder',
    description: 'Choose how to play this chord. You can pick from the list or build your own.',
    popoverClass: 'chord-explorer-tour-popover-welcome',
  },
  {
    title: 'Chord Editor',
    description: 'Build or edit a voicing on guitar or piano. Tap notes or frets to create your voicing.',
  },
  {
    title: 'Quick select',
    description: 'Pick from library or your custom voicings. Tap a voicing to use it immediately.',
  },
  {
    title: 'Apply',
    description: 'Click Insert or Update to apply your choice to the chord.',
  },
];

export type TourCompleteReason = 'completed' | 'dismissed';

export interface ChordVoicingSelectionTourProps {
  isActive: boolean;
  onComplete: (reason?: TourCompleteReason) => void;
  onSkipPermanent: () => void;
}

const CENTRE_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
};

export default function ChordVoicingSelectionTour({
  isActive,
  onComplete,
  onSkipPermanent,
}: ChordVoicingSelectionTourProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const totalSteps = TOUR_STEPS.length;
  const currentStep = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

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
    <div className="chord-explorer-tour" role="dialog" aria-modal="true" aria-label="Chord Builder tour">
      <div
        className="chord-explorer-tour-overlay"
        onClick={handleClose}
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
        aria-hidden
      />
      <div
        className={`chord-explorer-tour-popover ${currentStep?.popoverClass ?? ''}`}
        style={CENTRE_STYLE}
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
