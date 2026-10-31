'use client';

import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from 'react';

export interface MagnifierPosition {
  clientX: number;
  clientY: number;
  chordSymbol?: string;
}

export interface ChordDragMagnifierHandle {
  show: (pos: MagnifierPosition) => void;
  hide: () => void;
  updatePosition: (pos: MagnifierPosition) => void;
}

interface Props {
  sourceRef: React.RefObject<HTMLElement | null>;
  zoom?: number;
}

const MAGNIFIER_WIDTH = 180;
const MAGNIFIER_HEIGHT = 56;
const MAGNIFIER_OFFSET_Y = 72;
const DEFAULT_ZOOM = 2.2;

/**
 * iOS-style magnifying glass for touch chord-drag operations.
 * Clones the source lyric text DOM and applies CSS transform scaling
 * so the magnified view matches the actual rendered content exactly.
 */
export const ChordDragMagnifier = forwardRef<ChordDragMagnifierHandle, Props>(
  function ChordDragMagnifier({ sourceRef, zoom = DEFAULT_ZOOM }, ref) {
    const [visible, setVisible] = useState(false);
    const posRef = useRef<MagnifierPosition | null>(null);
    const [renderPos, setRenderPos] = useState<MagnifierPosition | null>(null);
    const cloneContainerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    const syncClone = useCallback(
      (p: MagnifierPosition) => {
        const container = cloneContainerRef.current;
        const source = sourceRef.current;
        if (!container || !source) return;

        const existing = container.querySelector('[data-magnifier-clone]');
        if (existing) existing.remove();

        const clone = source.cloneNode(true) as HTMLElement;
        clone.setAttribute('data-magnifier-clone', '');
        clone.style.position = 'absolute';
        clone.style.whiteSpace = 'pre';
        clone.style.pointerEvents = 'none';
        clone.style.transformOrigin = '0 0';
        clone.style.transform = `scale(${zoom})`;

        const sourceRect = source.getBoundingClientRect();
        const relX = p.clientX - sourceRect.left;
        const relY = p.clientY - sourceRect.top;

        const scaledX = relX * zoom;
        const scaledY = relY * zoom;
        clone.style.left = `${MAGNIFIER_WIDTH / 2 - scaledX}px`;
        clone.style.top = `${MAGNIFIER_HEIGHT / 2 - scaledY}px`;

        container.appendChild(clone);
      },
      [sourceRef, zoom]
    );

    const show = useCallback(
      (p: MagnifierPosition) => {
        posRef.current = p;
        setRenderPos(p);
        setVisible(true);
      },
      []
    );

    const hide = useCallback(() => {
      setVisible(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }, []);

    const updatePosition = useCallback(
      (p: MagnifierPosition) => {
        posRef.current = p;
        setRenderPos(p);
        setVisible(true);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => syncClone(p));
      },
      [syncClone]
    );

    useImperativeHandle(ref, () => ({ show, hide, updatePosition }), [show, hide, updatePosition]);

    useEffect(() => {
      if (visible && renderPos) {
        syncClone(renderPos);
      }
    }, [visible, renderPos, syncClone]);

    useEffect(() => {
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    const pos = renderPos;
    if (!pos) return null;

    const left = Math.max(
      MAGNIFIER_WIDTH / 2 + 4,
      Math.min(pos.clientX, window.innerWidth - MAGNIFIER_WIDTH / 2 - 4)
    );
    const top = Math.max(
      MAGNIFIER_HEIGHT + 4,
      pos.clientY - MAGNIFIER_OFFSET_Y
    );

    return (
      <div
        className="fixed pointer-events-none"
        style={{
          left: left - MAGNIFIER_WIDTH / 2,
          top: top - MAGNIFIER_HEIGHT / 2,
          width: MAGNIFIER_WIDTH,
          height: MAGNIFIER_HEIGHT,
          zIndex: 9999,
          opacity: visible ? 1 : 0,
          transition: 'left 0.04s linear, top 0.04s linear, opacity 0.12s ease-out',
        }}
      >
        <div
          className="relative w-full h-full overflow-hidden"
          style={{
            borderRadius: '20px',
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            boxShadow:
              '0 10px 40px rgba(0,0,0,0.28), 0 2px 10px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <div
            ref={cloneContainerRef}
            className="relative w-full h-full overflow-hidden font-mono text-sm text-foreground"
          />

          {pos.chordSymbol && (
            <div
              className="absolute top-0 left-0 right-0 flex items-center justify-center pt-0.5 text-accent font-mono font-bold"
              style={{ fontSize: `${10 * zoom}px`, lineHeight: 1, pointerEvents: 'none' }}
            >
              {pos.chordSymbol}
            </div>
          )}

          {/* Vertical crosshair line in center */}
          <div
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
            style={{
              width: 1.5,
              background: 'var(--accent)',
              opacity: 0.5,
            }}
          />
        </div>
        {/* Down-pointing triangle */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: -7,
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '7px solid var(--border)',
          }}
        />
      </div>
    );
  }
);
