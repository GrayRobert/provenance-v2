'use client';

import { useEffect, useState } from 'react';

const CONFIRM_WORD = 'delete';

export interface DeleteSongConfirmModalProps {
  open: boolean;
  songTitle: string;
  onClose: () => void;
  onConfirm: () => void;
  /** When true, confirm button is disabled (e.g. delete request in flight). */
  loading?: boolean;
}

export function DeleteSongConfirmModal({
  open,
  songTitle,
  onClose,
  onConfirm,
  loading = false,
}: DeleteSongConfirmModalProps) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, onClose]);

  const canConfirm = typed.trim().toLowerCase() === CONFIRM_WORD && !loading;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm();
    // Parent closes modal after async delete completes
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-song-title"
      aria-describedby="delete-song-desc"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative max-w-md w-full rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h2
          id="delete-song-title"
          className="text-lg font-semibold text-destructive"
        >
          Permanently delete song
        </h2>
        <p id="delete-song-desc" className="mt-2 text-sm text-muted-foreground">
          This will permanently delete &quot;{songTitle || 'Untitled Song'}&quot; and
          all its content. This cannot be undone.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Type <strong className="text-foreground">{CONFIRM_WORD}</strong> to
          confirm:
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_WORD}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive"
          aria-label={`Type ${CONFIRM_WORD} to confirm`}
          autoComplete="off"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
