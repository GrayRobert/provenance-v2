import { Event, WritingSession } from './types';

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Groups events into writing sessions based on inactivity.
 * A new session starts when there's a gap > 30 minutes between events.
 */
export function groupEventsIntoSessions(events: Event[]): WritingSession[] {
  if (events.length === 0) {
    return [];
  }

  // Sort events by timestamp (ascending)
  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const sessions: WritingSession[] = [];
  let currentSession: Event[] = [sortedEvents[0]];

  for (let i = 1; i < sortedEvents.length; i++) {
    const currentEvent = sortedEvents[i];
    const previousEvent = sortedEvents[i - 1];
    
    const timeDiff = new Date(currentEvent.timestamp).getTime() - 
                     new Date(previousEvent.timestamp).getTime();

    if (timeDiff > INACTIVITY_THRESHOLD_MS) {
      // Time gap > 30 minutes: start new session
      sessions.push(createSession(currentSession));
      currentSession = [currentEvent];
    } else {
      // Same session continues
      currentSession.push(currentEvent);
    }
  }

  // Add the last session
  if (currentSession.length > 0) {
    sessions.push(createSession(currentSession));
  }

  // Latest first: reverse sessions, and within each session reverse events
  const reversedSessions = [...sessions].reverse();
  return reversedSessions.map((s) => ({
    ...s,
    events: [...s.events].reverse(),
  }));
}

/**
 * Creates a WritingSession object from a group of events
 */
function createSession(events: Event[]): WritingSession {
  const startTime = events[0].timestamp;
  const endTime = events[events.length - 1].timestamp;
  
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const durationMinutes = Math.round((endMs - startMs) / (1000 * 60));

  const summary = calculateSummary(events);

  return {
    id: `session-${startTime}`,
    startTime,
    endTime,
    durationMinutes,
    events,
    summary,
  };
}

/**
 * Calculates summary statistics for a session
 */
function calculateSummary(events: Event[]): WritingSession['summary'] {
  let linesWritten = 0;
  let sectionsCreated = 0;
  let chordsAdded = 0;
  let editsMode = 0;

  for (const event of events) {
    switch (event.eventType) {
      case 'LineAddedEvent':
        linesWritten++;
        break;
      case 'SectionAddedEvent':
        sectionsCreated++;
        break;
      case 'ChordAddedEvent':
        chordsAdded++;
        break;
      case 'LineEditedEvent':
        editsMode++;
        break;
      case 'TabAddedEvent':
        linesWritten += 6;
        break;
      case 'TabEditedEvent':
        editsMode++;
        break;
    }
  }

  return {
    linesWritten,
    sectionsCreated,
    chordsAdded,
    editsMode,
  };
}





