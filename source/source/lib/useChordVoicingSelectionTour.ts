'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { userTourApi, type UserTourStatus } from '@/lib/api';

const CHORD_VOICING_SELECTION_TOUR_ID = 'chord_voicing_selection';

export interface ChordVoicingSelectionTourProps {
  showTutorialOnOpen: boolean;
  onTutorialComplete: (reason?: 'completed' | 'dismissed') => void;
  onTutorialSkipPermanent: () => void;
}

/**
 * Hook to provide chord-voicing-selection tour state and callbacks for persistence.
 * When user is not authenticated, showTutorialOnOpen is false.
 * Fetches tour state once when user is present; persists on complete or skip-permanent.
 */
export function useChordVoicingSelectionTour(): ChordVoicingSelectionTourProps {
  const user = useAuthStore((state) => state.user);
  const [tourStatus, setTourStatus] = useState<UserTourStatus | null | undefined>(undefined);

  useEffect(() => {
    if (!user) {
      setTourStatus(undefined);
      return;
    }
    let cancelled = false;
    userTourApi
      .getState(CHORD_VOICING_SELECTION_TOUR_ID)
      .then((state) => {
        if (!cancelled) setTourStatus(state?.status ?? null);
      })
      .catch(() => {
        if (!cancelled) setTourStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const showTutorialOnOpen = !!user && tourStatus === null;

  const onTutorialComplete = useCallback((reason?: 'completed' | 'dismissed') => {
    if (reason === 'completed') {
      setTourStatus('completed');
      userTourApi.setState(CHORD_VOICING_SELECTION_TOUR_ID, 'completed').catch(() => {});
    }
  }, []);

  const onTutorialSkipPermanent = useCallback(() => {
    setTourStatus('skip_permanent');
    userTourApi.setState(CHORD_VOICING_SELECTION_TOUR_ID, 'skip_permanent').catch(() => {});
  }, []);

  return {
    showTutorialOnOpen: showTutorialOnOpen ?? false,
    onTutorialComplete,
    onTutorialSkipPermanent,
  };
}
