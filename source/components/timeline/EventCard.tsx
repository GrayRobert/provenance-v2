'use client';

import { useMemo, useState } from 'react';
import { Event } from '@/lib/types';
import { getHumanReadableDescription } from '@/lib/eventInterpreter';
import { getEventBadgeClassName } from '@/lib/eventBadgeConfig';
import SourceBadge from '../shared/SourceBadge';
import { HashVisualizer } from './HashVisualizer';

interface EventCardProps {
  event: Event;
  showMetadata?: boolean;
  compact?: boolean;
  /** chordId -> voicingId so we can show current voicing for chord events (e.g. ChordAddedEvent stored null) */
  chordVoicingMap?: Record<string, string>;
  /** This event is the one that broke the hash chain. */
  isChainViolation?: boolean;
  /** Reason the chain is invalid (shown when isChainViolation). */
  violationReason?: string;
}

export default function EventCard({
  event,
  showMetadata = false,
  compact = false,
  chordVoicingMap = {},
  isChainViolation = false,
  violationReason,
}: EventCardProps) {
  const [metadataExpanded, setMetadataExpanded] = useState(showMetadata);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const description = getHumanReadableDescription(event);
  const payloadParsed = useMemo(() => {
    try {
      return JSON.parse(event.payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [event.payload]);

  if (compact) {
    return (
      <div className="text-sm text-foreground py-1">
        {description}
      </div>
    );
  }

  return (
    <div
      className={
        isChainViolation
          ? 'rounded-lg border-2 border-destructive bg-destructive/5 px-4 py-3'
          : 'rounded-lg border border-border bg-surface/80 px-4 py-3'
      }
      role={isChainViolation ? 'alert' : undefined}
    >
      {isChainViolation && violationReason && (
        <p className="mb-2 text-xs font-medium text-destructive">
          Chain broken here: {violationReason}
        </p>
      )}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Primary description */}
          <p className="text-sm font-medium text-foreground mb-2">
            {description}
          </p>

          {/* Badges and timestamp */}
          <div className="flex items-center space-x-3 mb-1">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${getEventBadgeClassName(
                event.eventType
              )}`}
            >
              {event.eventType}
            </span>
            <SourceBadge source={event.source} showTooltip />
            <span className="text-xs text-muted">
              #{event.sequenceNumber}
            </span>
          </div>

          <p className="text-xs text-muted mb-2">
            {formatTimestamp(event.timestamp)}
          </p>

          {/* Expandable metadata */}
          <details
            open={metadataExpanded}
            onToggle={(e) => setMetadataExpanded(e.currentTarget.open)}
          >
            <summary className="text-xs text-muted cursor-pointer hover:text-foreground">
              {metadataExpanded ? 'Hide' : 'Show'} metadata
            </summary>
            <div className="mt-2 p-3 bg-surface rounded text-xs space-y-1 text-foreground border border-border">
              <div>
                <span className="font-medium">Event ID:</span> {event.eventId}
              </div>
              <div>
                <span className="font-medium">Sequence:</span> #{event.sequenceNumber}
              </div>
              {event.eventHash != null && (
                <div className="mt-2 space-y-2 border-t border-border pt-2">
                  <div className="flex items-start gap-2">
                    <HashVisualizer hash={event.eventHash} size={4} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                        Event hash
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-foreground">
                        {event.eventHash}
                      </p>
                    </div>
                  </div>
                  {event.previousHash != null && event.previousHash !== '' && (
                    <div className="flex items-start gap-2">
                      <HashVisualizer hash={event.previousHash} size={4} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                          Previous hash
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[11px] text-muted">
                          {event.previousHash}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {payloadParsed.chordId && chordVoicingMap[payloadParsed.chordId as string] ? (
                <div className="mt-1 text-accent">
                  <span className="font-medium">Current voicing:</span>{' '}
                  {chordVoicingMap[payloadParsed.chordId as string]}
                  <span className="text-muted ml-1">(set by later event)</span>
                </div>
              ) : null}
              <div className="mt-2">
                <span className="font-medium">Payload:</span>
                <pre className="mt-1 bg-background p-2 rounded overflow-x-auto text-xs border border-border">
                  {JSON.stringify(payloadParsed, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}





