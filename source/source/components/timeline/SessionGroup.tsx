'use client';

import { useState } from 'react';
import { WritingSession } from '@/lib/types';
import { getEventsSummary } from '@/lib/eventInterpreter';
import EventCard from './EventCard';

interface SessionGroupProps {
  session: WritingSession;
  /** Flat index of the first event in this session (for chain violation highlighting). */
  eventStartIndex?: number;
  /** 0-based flat index of the event that broke the chain; -1 when none. */
  breakingEventIndex?: number;
  /** Reason shown on the breaking event card. */
  violationReason?: string;
  defaultExpanded?: boolean;
  showTimestamps?: boolean;
  chordVoicingMap?: Record<string, string>;
}

export default function SessionGroup({
  session,
  eventStartIndex = 0,
  breakingEventIndex = -1,
  violationReason,
  defaultExpanded = false,
  showTimestamps = true,
  chordVoicingMap = {},
}: SessionGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const formatTimeRange = () => {
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    
    const dateStr = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const startTime = start.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const endTime = end.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${dateStr} · ${startTime}–${endTime}`;
  };

  const getDurationText = () => {
    if (session.durationMinutes === 0) return 'Less than a minute';
    if (session.durationMinutes === 1) return '1 minute';
    if (session.durationMinutes < 60) return `${session.durationMinutes} minutes`;
    
    const hours = Math.floor(session.durationMinutes / 60);
    const minutes = session.durationMinutes % 60;
    
    if (minutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min`;
  };

  const summary = getEventsSummary(session.events);

  return (
    <div className="bg-surface rounded-lg shadow border border-border mb-4">
      {/* Session header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 hover:bg-border/50 transition-colors cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-lg text-foreground">
                {isExpanded ? '▾' : '▸'}
              </span>
              <h3 className="text-base font-semibold text-foreground">
                Writing Session · {getDurationText()}
              </h3>
            </div>
            {showTimestamps && (
              <p className="text-sm text-muted mt-1 ml-7">
                {formatTimeRange()}
              </p>
            )}
            <p className="text-sm text-muted mt-1 ml-7">
              {summary}
            </p>
          </div>
          <div className="text-sm text-muted">
            {session.events.length} event{session.events.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Expanded event list */}
      {isExpanded && (
        <div className="border-t border-border divide-y divide-border">
          {session.events.map((event, localIndex) => {
            const flatIndex = eventStartIndex + localIndex;
            const isChainViolation = breakingEventIndex >= 0 && flatIndex === breakingEventIndex;
            return (
              <div key={event.eventId} className="px-6">
                <EventCard
                  event={event}
                  compact={false}
                  chordVoicingMap={chordVoicingMap}
                  isChainViolation={isChainViolation}
                  violationReason={isChainViolation ? violationReason : undefined}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

