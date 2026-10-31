'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, Trash2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  createEmptyGuitarTabGrid,
  type GuitarTabWidthPreset,
  guitarTabTotalSlots,
  GUITAR_TAB_INNER_DASHES,
  GUITAR_TAB_STRING_LABELS,
  migrateGuitarTabGridToBarCount,
  migrateGuitarTabGridToPreset,
  normalizeGuitarTabGrid,
  parseGuitarTabStaffLinesToGrid,
  serializeGuitarTabGridToStaff,
} from '@/lib/guitar-tab-bar';

const WIDTH_PRESETS: { key: GuitarTabWidthPreset; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
];

/** Symbols for ASCII tab techniques (frets 0–9 and rest “-” are typed on the grid, not shown here). */
const GUITAR_TAB_TECHNIQUES: { symbol: string; insert: string; technique: string }[] = [
  { symbol: 'h', insert: 'h', technique: 'hammer on' },
  { symbol: 'p', insert: 'p', technique: 'pull off' },
  { symbol: 'b', insert: 'b', technique: 'bend string up' },
  { symbol: 'r', insert: 'r', technique: 'release bend' },
  { symbol: '/', insert: '/', technique: 'slide up' },
  { symbol: '\\', insert: '\\', technique: 'slide down' },
  { symbol: 'v', insert: 'v', technique: 'vibrato (sometimes written as ~)' },
  { symbol: 't', insert: 't', technique: 'right hand tap' },
  { symbol: 's', insert: 's', technique: 'legato slide' },
  { symbol: 'S', insert: 'S', technique: 'shift slide' },
  { symbol: '*', insert: '*', technique: 'natural harmonic' },
  { symbol: '[n]', insert: '[n]', technique: 'artificial harmonic' },
  { symbol: 'n(n)', insert: 'n(n)', technique: 'tapped harmonic' },
  { symbol: 'tr', insert: 'tr', technique: 'trill' },
  { symbol: 'T', insert: 'T', technique: 'tap' },
  { symbol: 'TP', insert: 'TP', technique: 'tremolo picking' },
  { symbol: 'PM', insert: 'PM', technique: 'palm muting (also written as _)' },
  { symbol: String.raw`\n/`, insert: '\\n/', technique: 'tremolo arm dip; n = amount to dip' },
  { symbol: String.raw`\n`, insert: '\\n', technique: 'tremolo arm down' },
  { symbol: 'n/', insert: 'n/', technique: 'tremolo arm up' },
  { symbol: '/n\\', insert: '/n\\', technique: 'tremolo arm inverted dip' },
  { symbol: '=', insert: '=', technique: 'hold bend; also acts as connecting device for hammers/pulls' },
  { symbol: '<>', insert: '<>', technique: 'volume swell (louder/softer)' },
  { symbol: 'x', insert: 'x', technique: 'on rhythm slash represents muted slash' },
  { symbol: 'o', insert: 'o', technique: 'on rhythm slash represents single note slash' },
  { symbol: '·/.', insert: '·/.', technique: 'pick slide' },
];

/** Touch pad: rows 1–4 are frets 1–24 in order; row 5 is 0, X, space (2 cols), del (2 cols). */
type TouchFretPadItem =
  | { kind: 'fret'; insert: string; label: string; colSpan: 1 }
  | { kind: 'space'; colSpan: 2 }
  | { kind: 'delete'; colSpan: 2 };

function buildTouchFretPadRows(): TouchFretPadItem[][] {
  const frets1Through24 = Array.from({ length: 24 }, (_, i) => ({
    kind: 'fret' as const,
    insert: String(i + 1),
    label: String(i + 1),
    colSpan: 1 as const,
  }));
  return [
    frets1Through24.slice(0, 6),
    frets1Through24.slice(6, 12),
    frets1Through24.slice(12, 18),
    frets1Through24.slice(18, 24),
    [
      { kind: 'fret', insert: '0', label: '0', colSpan: 1 },
      { kind: 'fret', insert: 'x', label: 'X', colSpan: 1 },
      { kind: 'space', colSpan: 2 },
      { kind: 'delete', colSpan: 2 },
    ],
  ];
}

/** Touch-first devices: avoid treating laptop touchscreens as “tablet mode” (those often report fine + hover). */
function useTouchPrimaryUi(): boolean {
  const [touchPrimary, setTouchPrimary] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const read = () => setTouchPrimary(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return touchPrimary;
}

export interface GuitarTabBarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Six staff lines (high e through low E). */
  onInsert: (
    lines: string[],
    replaceLineIds?: string[],
    context?: { barCount: number; widthPreset: GuitarTabWidthPreset }
  ) => void;
  /** When reopening from the song editor, prefill from these six lines. */
  initialStaffLines?: string[] | null;
  /** When set with six ids, Insert updates those lines instead of appending new ones. */
  replaceLineIds?: string[] | null;
  /** Archive existing six-line tab block (edit mode only). */
  onArchiveTabBlock?: (replaceLineIds: string[]) => void;
}

export function GuitarTabBarModal({
  open,
  onOpenChange,
  onInsert,
  initialStaffLines = null,
  replaceLineIds = null,
  onArchiveTabBlock,
}: GuitarTabBarModalProps) {
  const [barCount, setBarCount] = useState(2);
  const [widthPreset, setWidthPreset] = useState<GuitarTabWidthPreset>('medium');
  const [grid, setGrid] = useState<string[][]>(() => createEmptyGuitarTabGrid(2, 'medium'));
  const [focusRow, setFocusRow] = useState(0);
  const [focusCol, setFocusCol] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advanceOnType, setAdvanceOnType] = useState(true);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridScrollViewportRef = useRef<HTMLDivElement>(null);
  const touchPadRef = useRef<HTMLDivElement>(null);
  const touchPrimaryUi = useTouchPrimaryUi();

  const cols = useMemo(() => guitarTabTotalSlots(barCount, widthPreset), [barCount, widthPreset]);
  const innerW = GUITAR_TAB_INNER_DASHES[widthPreset];

  const isReplaceMode = replaceLineIds?.length === 6;

  // When dialog opens: load from initialStaffLines if parseable, else default empty 2-bar medium.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional modal reset when open or source lines change */
  useEffect(() => {
    if (!open) return;
    if (initialStaffLines?.length === 6) {
      const parsed = parseGuitarTabStaffLinesToGrid(initialStaffLines);
      if (parsed) {
        setBarCount(parsed.barCount);
        setWidthPreset(parsed.widthPreset);
        setGrid(normalizeGuitarTabGrid(parsed.grid, parsed.barCount, parsed.widthPreset));
        setFocusRow(0);
        setFocusCol(0);
        return;
      }
    }
    setBarCount(2);
    setWidthPreset('medium');
    setGrid(createEmptyGuitarTabGrid(2, 'medium'));
    setFocusRow(0);
    setFocusCol(0);
  }, [open, initialStaffLines]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** After open + layout, move keyboard focus to the fretboard so Arrow keys work immediately (desktop / fine pointer). */
  useLayoutEffect(() => {
    if (!open || touchPrimaryUi) return;
    let alive = true;
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        if (!alive) return;
        gridContainerRef.current?.focus({ preventScroll: true });
      });
    });
    const t = window.setTimeout(() => {
      if (!alive) return;
      gridContainerRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => {
      alive = false;
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.clearTimeout(t);
    };
  }, [open, touchPrimaryUi, barCount, widthPreset]);

  /** User changed bar count: preserve overlapping bars at current width. */
  const applyBarCount = useCallback(
    (n: number) => {
      const clamped = Math.max(1, Math.min(8, Math.floor(Number(n)) || 1));
      if (clamped === barCount) return;
      const newCols = guitarTabTotalSlots(clamped, widthPreset);
      setGrid((g) => migrateGuitarTabGridToBarCount(g, barCount, clamped, widthPreset));
      setBarCount(clamped);
      setFocusCol((c) => Math.max(0, Math.min(c, newCols - 1)));
    },
    [barCount, widthPreset]
  );

  const applyWidthPreset = useCallback(
    (preset: GuitarTabWidthPreset) => {
      if (preset === widthPreset) return;
      const newCols = guitarTabTotalSlots(barCount, preset);
      setGrid((g) => migrateGuitarTabGridToPreset(g, barCount, widthPreset, preset));
      setWidthPreset(preset);
      setFocusCol((c) => Math.max(0, Math.min(c, newCols - 1)));
    },
    [barCount, widthPreset]
  );

  /** Keep the focused cell visible inside the horizontal scroll viewport (keyboard navigation). */
  useEffect(() => {
    if (!open) return;
    const vp = gridScrollViewportRef.current;
    if (!vp) return;
    requestAnimationFrame(() => {
      const el = vp.querySelector<HTMLElement>('[data-guitar-tab-cell-focus="true"]');
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [open, focusRow, focusCol]);

  const previewLines = useMemo(() => {
    const normalized = normalizeGuitarTabGrid(grid, barCount, widthPreset);
    const staff = serializeGuitarTabGridToStaff(normalized, barCount, widthPreset);
    return staff.join('\n');
  }, [barCount, widthPreset, grid]);

  const setCell = useCallback((r: number, c: number, ch: string) => {
    const char = ch.slice(0, 1);
    setGrid((g) => {
      const next = g.map((row) => [...row]);
      if (next[r] && c >= 0 && c < next[r].length) next[r][c] = char;
      return next;
    });
  }, []);

  const applyInsertAtFocus = useCallback(
    (chars: string) => {
      setGrid((g) => {
        const next = g.map((row) => [...row]);
        const row = next[focusRow];
        if (!row) return g;
        let c = focusCol;
        for (let i = 0; i < chars.length; i++) {
          if (c >= row.length) break;
          row[c] = chars[i]!;
          c += 1;
        }
        return next;
      });
      setFocusCol((c) => Math.min(c + chars.length, cols - 1));
    },
    [focusRow, focusCol, cols]
  );

  const moveFocus = useCallback(
    (dr: number, dc: number) => {
      setFocusRow((r) => Math.max(0, Math.min(GUITAR_TAB_STRING_LABELS.length - 1, r + dr)));
      setFocusCol((c) => Math.max(0, Math.min(cols - 1, c + dc)));
    },
    [cols]
  );

  /** Same as Space (no Shift) on the fretboard: insert rest column and advance. */
  const applySpaceAtFocus = useCallback(() => {
    setGrid((g) => {
      const next = g.map((row) => [...row]);
      const row = next[focusRow];
      if (!row) return g;
      const v = row[focusCol];
      if (v !== '-' && focusCol < row.length - 1) {
        for (let j = row.length - 1; j > focusCol; j--) {
          row[j] = row[j - 1]!;
        }
        row[focusCol] = '-';
      }
      return next;
    });
    moveFocus(0, 1);
  }, [focusRow, focusCol, moveFocus]);

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (touchPrimaryUi) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1, 0);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1, 0);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveFocus(0, -1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveFocus(0, 1);
        return;
      }
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          setGrid((g) => {
            const next = g.map((row) => [...row]);
            const row = next[focusRow];
            if (!row) return g;
            const v = row[focusCol];
            if (v !== '-') {
              for (let j = focusCol; j < row.length - 1; j++) {
                row[j] = row[j + 1]!;
              }
              row[row.length - 1] = '-';
            }
            return next;
          });
          moveFocus(0, -1);
        } else {
          applySpaceAtFocus();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setCell(focusRow, focusCol, '-');
        if (e.key === 'Backspace' && focusCol > 0) {
          moveFocus(0, -1);
        }
        return;
      }
      /* Any single printable key: frets, tab symbols (h, p, /, *, etc.), letters for multi-cell tokens (e.g. tr, PM). Space handled above. */
      if (
        e.key.length === 1 &&
        e.key !== ' ' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setCell(focusRow, focusCol, e.key);
        if (advanceOnType) moveFocus(0, 1);
      }
    },
    [advanceOnType, touchPrimaryUi, focusRow, focusCol, moveFocus, setCell, applySpaceAtFocus]
  );

  const refocusGridAfterTouchPad = useCallback(() => {
    if (!touchPrimaryUi) {
      gridContainerRef.current?.focus({ preventScroll: true });
    }
  }, [touchPrimaryUi]);

  /** Touch pad: multi-digit frets span consecutive columns (same as palette / keyboard). */
  const applyTouchPadInsert = useCallback(
    (insert: string) => {
      applyInsertAtFocus(insert);
      refocusGridAfterTouchPad();
    },
    [applyInsertAtFocus, refocusGridAfterTouchPad]
  );

  const applyTouchPadSpace = useCallback(() => {
    applySpaceAtFocus();
    refocusGridAfterTouchPad();
  }, [applySpaceAtFocus, refocusGridAfterTouchPad]);

  const applyTouchPadDelete = useCallback(() => {
    setCell(focusRow, focusCol, '-');
    refocusGridAfterTouchPad();
  }, [focusRow, focusCol, setCell, refocusGridAfterTouchPad]);

  const touchFretPadRows = useMemo(() => buildTouchFretPadRows(), []);

  const handleInsert = () => {
    const normalized = normalizeGuitarTabGrid(grid, barCount, widthPreset);
    const staff = serializeGuitarTabGridToStaff(normalized, barCount, widthPreset);
    onInsert(staff, isReplaceMode ? replaceLineIds ?? undefined : undefined, {
      barCount,
      widthPreset,
    });
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guitar-tab-bar-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} aria-hidden />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 id="guitar-tab-bar-title" className="text-lg font-semibold text-foreground">
            {isReplaceMode ? 'Edit tab' : 'Add tab'}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded text-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="guitar-tab-bars" className="text-xs font-medium text-muted">
              Bars
            </label>
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              <select
                id="guitar-tab-bars"
                value={barCount}
                onChange={(e) => applyBarCount(Number(e.target.value))}
                className="box-border min-h-[2.25rem] w-[4.5rem] rounded-md border-0 bg-transparent px-2 py-2 text-sm font-medium text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Width</span>
            <div className="flex max-w-md rounded-lg border border-border bg-background p-0.5 gap-0.5">
              {WIDTH_PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyWidthPreset(key)}
                  className={`flex-1 min-w-0 rounded-md px-2 py-2 text-sm font-medium transition-colors touch-manipulation ${
                    widthPreset === key
                      ? 'bg-accent text-white'
                      : 'text-muted hover:text-foreground hover:bg-border/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">Fretboard</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1">
              <span className="text-[11px] text-muted whitespace-nowrap" id="guitar-tab-advance-label">
                Advance on type
              </span>
              <Switch
                aria-labelledby="guitar-tab-advance-label"
                checked={advanceOnType}
                onCheckedChange={setAdvanceOnType}
                className="h-5 w-9 shrink-0 border border-border/80 data-[state=unchecked]:bg-muted/70 data-[state=checked]:border-transparent data-[state=checked]:bg-accent [&>span]:h-4 [&>span]:w-4 [&>span]:bg-card [&>span]:shadow-sm [&>span]:ring-1 [&>span]:ring-border/60 [&>span]:data-[state=checked]:translate-x-4"
              />
            </div>
          </div>
          <div
            ref={gridContainerRef}
            role="grid"
            aria-label="Guitar tab fretboard"
            tabIndex={touchPrimaryUi ? -1 : 0}
            onKeyDown={onGridKeyDown}
            className="guitar-tab-fretboard-keyboard-root w-full max-w-full rounded-lg border border-border bg-background outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0"
          >
            <div
              ref={gridScrollViewportRef}
              className="max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain touch-pan-x p-2"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="flex w-max min-w-full gap-0 font-mono text-xs leading-none">
                {Array.from({ length: barCount }, (_, bi) => (
                  <div
                    key={bi}
                    className="flex flex-col border-l border-border first:border-l-0 pl-1 ml-1 first:pl-0 first:ml-0"
                  >
                    <span className="text-[10px] text-muted text-center mb-0.5 select-none">Bar {bi + 1}</span>
                    <div className="flex flex-col gap-0">
                      {GUITAR_TAB_STRING_LABELS.map((lab, r) => (
                        <div key={lab} className="flex items-center gap-0">
                          <span className="w-3 shrink-0 text-muted select-none">{lab}</span>
                          <div className="flex">
                            {Array.from({ length: innerW }, (_, j) => {
                              const c = bi * innerW + j;
                              const v = grid[r]?.[c] ?? '-';
                              const focused = r === focusRow && c === focusCol;
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  role="gridcell"
                                  tabIndex={-1}
                                  aria-selected={focused}
                                  data-guitar-tab-cell-focus={focused ? 'true' : undefined}
                                  className={`w-5 h-6 shrink-0 border border-border/60 text-center leading-6 outline-none focus:outline-none ${
                                    focused ? 'bg-accent/25 ring-2 ring-accent z-10' : 'hover:bg-border/30'
                                  }`}
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    setFocusRow(r);
                                    setFocusCol(c);
                                    if (!touchPrimaryUi) {
                                      gridContainerRef.current?.focus({ preventScroll: true });
                                    } else {
                                      touchPadRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                    }
                                  }}
                                >
                                  {v}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {touchPrimaryUi ? (
          <div
            ref={touchPadRef}
            className="mb-3 rounded-xl border border-border bg-muted/25 p-3 shadow-inner"
            aria-label="Fret and rest pad for touch"
          >
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Frets 0–24 · X mute · space · del
            </p>
            <div className="flex flex-col gap-2">
              {touchFretPadRows.map((row, ri) => (
                <div key={`touch-fret-row-${ri}`} className="grid grid-cols-6 gap-2">
                  {row.map((item, ci) => {
                    const padBtn =
                      'flex min-h-11 min-w-0 items-center justify-center rounded-lg border border-border/80 bg-background shadow-sm touch-manipulation active:scale-[0.98] hover:bg-border/30';
                    if (item.kind === 'fret') {
                      return (
                        <button
                          key={`touch-fret-${ri}-${ci}`}
                          type="button"
                          title={item.insert === 'x' ? 'Mute (x)' : `Fret ${item.insert}`}
                          className={`${padBtn} text-base font-mono font-semibold text-foreground`}
                          onClick={() => applyTouchPadInsert(item.insert)}
                        >
                          {item.label}
                        </button>
                      );
                    }
                    if (item.kind === 'space') {
                      return (
                        <button
                          key={`touch-fret-${ri}-${ci}`}
                          type="button"
                          className={`${padBtn} col-span-2 text-sm font-mono font-semibold text-foreground`}
                          title="Space — insert rest column, advance (same as keyboard Space)"
                          aria-label="Insert rest column and advance"
                          onClick={applyTouchPadSpace}
                        >
                          space
                        </button>
                      );
                    }
                    return (
                      <button
                        key={`touch-fret-${ri}-${ci}`}
                        type="button"
                        className={`${padBtn} col-span-2 text-sm font-mono font-semibold text-foreground`}
                        title="Delete — clear cell to rest"
                        aria-label="Clear cell"
                        onClick={applyTouchPadDelete}
                      >
                        del
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mb-3">
          <div className="mb-1 flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted">Palette</p>
            <button
              type="button"
              className="rounded p-0.5 text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Symbol reference"
              title="Symbol reference"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp className="size-4" aria-hidden />
            </button>
          </div>
          <div
            className="max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x rounded-lg border border-border bg-background p-2"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div
              className="flex h-[4.5rem] w-max max-w-none flex-col flex-wrap content-start items-start gap-1"
              role="list"
              aria-label="Technique symbols"
            >
              {GUITAR_TAB_TECHNIQUES.map((row) => (
                <button
                  key={row.symbol}
                  type="button"
                  role="listitem"
                  title={row.technique}
                  className="h-8 shrink-0 min-w-8 max-w-[8rem] truncate px-2 font-mono text-sm leading-none border border-border rounded bg-background hover:bg-border/40 touch-manipulation"
                  onClick={() => {
                    applyInsertAtFocus(row.insert);
                    if (!touchPrimaryUi) {
                      gridContainerRef.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  {row.symbol === '-' ? '—' : row.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="z-[110] max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>ASCII tab symbols</DialogTitle>
              <DialogDescription asChild>
                <span className="sr-only">Reference for technique symbols used in text-based guitar tab.</span>
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[20rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3 font-medium text-foreground">Symbol</th>
                    <th className="py-2 font-medium text-foreground">Technique</th>
                  </tr>
                </thead>
                <tbody>
                  {GUITAR_TAB_TECHNIQUES.map((row) => (
                    <tr key={row.symbol} className="border-b border-border/60">
                      <td className="py-1.5 pr-3 font-mono text-foreground align-top whitespace-nowrap">{row.symbol}</td>
                      <td className="py-1.5 text-muted-foreground align-top">{row.technique}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>

        <p className="mb-1 text-xs font-medium text-muted">ASCII Preview</p>
        <div
          className="mb-4 max-w-full overflow-x-auto overflow-y-auto overscroll-contain max-h-48 rounded-lg border border-border bg-background p-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
          aria-live="polite"
        >
          <pre className="m-0 w-max min-w-full p-0 text-xs font-mono text-foreground whitespace-pre">
            {previewLines}
          </pre>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 border border-border rounded-md text-foreground hover:bg-border/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover"
          >
            {isReplaceMode ? 'Save tab' : 'Insert 6 lines'}
          </button>
          {isReplaceMode && onArchiveTabBlock && (
            <button
              type="button"
              onClick={() => {
                onArchiveTabBlock(replaceLineIds);
                onOpenChange(false);
              }}
              className="p-2 rounded-md text-muted hover:text-foreground hover:bg-border/40"
              aria-label="Archive tab"
              title="Archive tab"
            >
              <Trash2 className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
