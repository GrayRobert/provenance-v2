import { isGuitarTabStaffLine } from './guitar-tab-bar';
import { isInstrumentalMeasureAsciiLine } from './instrumental-measure-row';
import type { Event } from './types';

function parsePayload(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function payloadTextForLineEvent(event: Event): string | null {
  const p = parsePayload(event.payload);
  if (event.eventType === 'LineAddedEvent') return typeof p.text === 'string' ? p.text : null;
  if (event.eventType === 'LineEditedEvent') {
    if (typeof p.newText === 'string') return p.newText;
    if (typeof p.text === 'string') return p.text;
    return null;
  }
  return null;
}

function areAdjacent(a: Event, b: Event): boolean {
  return b.sequenceNumber === a.sequenceNumber + 1 && b.source === a.source;
}

/** Build timeline-friendly synthetic events (tab/measure grouping) from raw chain events. */
export function transformTimelineEvents(events: Event[]): Event[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const out: Event[] = [];

  let i = 0;
  while (i < sorted.length) {
    const curr = sorted[i]!;

    // Group six contiguous LineArchivedEvent events as one TabArchivedEvent
    if (curr.eventType === 'LineArchivedEvent') {
      const run: Event[] = [curr];
      let j = i + 1;
      while (j < sorted.length) {
        const nxt = sorted[j]!;
        if (nxt.eventType !== 'LineArchivedEvent') break;
        if (!areAdjacent(sorted[j - 1]!, nxt)) break;
        run.push(nxt);
        j += 1;
      }
      if (run.length === 6) {
        const lineIds = run
          .map((e) => parsePayload(e.payload).lineId)
          .filter((x): x is string => typeof x === 'string');
        const first = run[0]!;
        out.push({
          ...first,
          eventId: `${first.eventId}-tab-archive`,
          eventType: 'TabArchivedEvent',
          payload: JSON.stringify({ lineCount: 6, lineIds }),
        });
        i = j;
        continue;
      }
    }

    // Group six contiguous tab staff line add/edit events as one tab event (legacy stream compatibility)
    if (curr.eventType === 'LineAddedEvent' || curr.eventType === 'LineEditedEvent') {
      const text = payloadTextForLineEvent(curr);
      if (text && isGuitarTabStaffLine(text)) {
        const run: Event[] = [curr];
        let j = i + 1;
        while (j < sorted.length) {
          const nxt = sorted[j]!;
          const t = payloadTextForLineEvent(nxt);
          if (nxt.eventType !== curr.eventType) break;
          if (!t || !isGuitarTabStaffLine(t)) break;
          if (!areAdjacent(sorted[j - 1]!, nxt)) break;
          run.push(nxt);
          j += 1;
        }
        if (run.length === 6) {
          const first = run[0]!;
          const texts = run.map((e) => payloadTextForLineEvent(e) ?? '');
          out.push({
            ...first,
            eventId: `${first.eventId}-tab-${curr.eventType === 'LineAddedEvent' ? 'add' : 'edit'}`,
            eventType: curr.eventType === 'LineAddedEvent' ? 'TabAddedEvent' : 'TabEditedEvent',
            payload: JSON.stringify({ lineCount: 6, lines: texts }),
          });
          i = j;
          continue;
        }
      }
    }

    // Group contiguous measure-row line add/edit events as one measure-row event
    if (curr.eventType === 'LineAddedEvent' || curr.eventType === 'LineEditedEvent') {
      const text = payloadTextForLineEvent(curr);
      if (text && isInstrumentalMeasureAsciiLine(text)) {
        const run: Event[] = [curr];
        let j = i + 1;
        while (j < sorted.length) {
          const nxt = sorted[j]!;
          const t = payloadTextForLineEvent(nxt);
          if (nxt.eventType !== curr.eventType) break;
          if (!t || !isInstrumentalMeasureAsciiLine(t)) break;
          if (!areAdjacent(sorted[j - 1]!, nxt)) break;
          run.push(nxt);
          j += 1;
        }
        const first = run[0]!;
        out.push({
          ...first,
          eventId: `${first.eventId}-measure-${curr.eventType === 'LineAddedEvent' ? 'add' : 'edit'}`,
          eventType: curr.eventType === 'LineAddedEvent' ? 'MeasureRowAddedEvent' : 'MeasureRowEditedEvent',
          payload: JSON.stringify({
            lineCount: run.length,
            lines: run.map((e) => payloadTextForLineEvent(e) ?? ''),
          }),
        });
        i = j;
        continue;
      }
    }

    out.push(curr);
    i += 1;
  }

  return out;
}

