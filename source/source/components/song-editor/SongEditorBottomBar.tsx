'use client';

import Link from 'next/link';
import { Music2, FileDown, Mic, Plus, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SongEditorBottomBarProps {
  songId: string;
  keyDrawerOpen: boolean;
  onKeyClick: () => void;
  exportDrawerOpen: boolean;
  onExportClick: () => void;
  addDrawerOpen: boolean;
  onAddClick: () => void;
  onRecordClick: () => void;
  isReadOnly?: boolean;
}

export function SongEditorBottomBar({
  songId,
  keyDrawerOpen,
  onKeyClick,
  exportDrawerOpen,
  onExportClick,
  addDrawerOpen,
  onAddClick,
  onRecordClick,
  isReadOnly = false,
}: SongEditorBottomBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border nav-bottom-bar backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Song tools"
    >
      <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-around px-2 sm:px-4 md:px-8">
        {/* Left */}
        <BarButton
          icon={<Music2 className="size-5" />}
          label="Key"
          active={keyDrawerOpen}
          onClick={onKeyClick}
          disabled={isReadOnly}
        />
        <BarButton
          icon={<FileDown className="size-5" />}
          label="Export"
          active={exportDrawerOpen}
          onClick={onExportClick}
        />

        {/* Center Record */}
        <div className="relative flex flex-col items-center">
          <button
            type="button"
            onClick={onRecordClick}
            disabled={isReadOnly}
            className={cn(
              'relative -mt-6 flex size-14 items-center justify-center rounded-full border-2 border-accent/30 bg-accent text-white shadow-[0_2px_12px_var(--accent-dim),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:scale-105 hover:shadow-[0_4px_20px_var(--accent-dim),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-95 disabled:opacity-50 disabled:hover:scale-100'
            )}
            aria-label="Record"
          >
            <Mic className="size-5" />
          </button>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Record
          </span>
        </div>

        {/* Right — always render so Record stays centered; read-only users see Add disabled */}
        <BarButton
          icon={<Plus className="size-5" />}
          label="Add"
          active={addDrawerOpen}
          onClick={onAddClick}
          disabled={isReadOnly}
        />
        <BarButton
          icon={<Clock className="size-5" />}
          label="Timeline"
          variant="timeline"
          href={`/song/timeline?id=${songId}`}
        />
      </div>
    </nav>
  );
}

function BarButton({
  icon,
  label,
  active,
  onClick,
  disabled,
  variant = 'default',
  href,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'timeline';
  href?: string;
}) {
  const isTimeline = variant === 'timeline';
  const boxClassName = cn(
    'flex size-9 items-center justify-center rounded-lg border transition-all',
    'shadow-[0_2px_4px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    'active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:translate-y-px',
    isTimeline && 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/15 hover:border-accent/40',
    !isTimeline && active && 'border-accent/40 bg-accent/10 text-accent',
    !isTimeline && !active && 'hover:border-muted-foreground/30 hover:text-foreground',
    disabled && 'opacity-50 pointer-events-none'
  );
  const labelClassName = cn(
    'text-[10px] font-semibold tracking-wide',
    isTimeline ? 'text-accent' : active ? 'text-accent' : 'text-muted-foreground',
    disabled && 'opacity-50'
  );
  const wrapperClassName = 'flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all';

  const content = (
    <>
      <span className={boxClassName}>{icon}</span>
      <span className={labelClassName}>{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={wrapperClassName} aria-label={label}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={wrapperClassName}
      aria-label={label}
    >
      {content}
    </button>
  );
}

