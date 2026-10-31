'use client';

import { useCallback, useEffect, useState } from 'react';
import { songApi } from '@/lib/api';
import type { Note } from '@/lib/types';
import { X, Trash2 } from 'lucide-react';
import { QuillEditor } from '@/components/notes/QuillEditor';

export interface NotesModalProps {
  isOpen: boolean;
  songId: string;
  /** When set, open in edit mode for this note; otherwise create mode. */
  initialNoteId?: string | null;
  onClose: () => void;
  onSaveSuccess?: () => void;
  onSaveError?: (error: string) => void;
}

export default function NotesModal({
  isOpen,
  songId,
  initialNoteId,
  onClose,
  onSaveSuccess,
  onSaveError,
}: NotesModalProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const isEdit = Boolean(initialNoteId);
  const canArchive = isEdit && note && !note.archivedAt;

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const t = document.documentElement.getAttribute('data-theme');
    setTheme(t === 'dark' ? 'dark' : 'light');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setBody('');
    setNote(null);
    if (initialNoteId) {
      setLoading(true);
      songApi
        .getNote(songId, initialNoteId)
        .then((n) => {
          setNote(n);
          setTitle(n.title ?? '');
          setBody(n.body ?? '');
        })
        .catch(() => onSaveError?.('Failed to load note'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, songId, initialNoteId, onSaveError]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (isEdit && initialNoteId) {
        await songApi.editNote(songId, initialNoteId, { title: title || undefined, body });
      } else {
        await songApi.addNote(songId, { title: title || undefined, body });
      }
      onSaveSuccess?.();
      onClose();
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : 'Failed to save note');
      onSaveError?.(message);
    } finally {
      setSaving(false);
    }
  }, [songId, initialNoteId, isEdit, title, body, onClose, onSaveSuccess, onSaveError]);

  const handleArchive = useCallback(async () => {
    if (!initialNoteId || !note || note.archivedAt) return;
    setArchiving(true);
    try {
      await songApi.archiveNote(songId, initialNoteId);
      onSaveSuccess?.();
      onClose();
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : 'Failed to archive note');
      onSaveError?.(message);
    } finally {
      setArchiving(false);
    }
  }, [songId, initialNoteId, note, onClose, onSaveSuccess, onSaveError]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  const handleQuillChange = useCallback((html: string) => {
    setBody(html);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden w-full h-full max-w-[100vw] max-h-[100dvh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-modal-title"
      data-theme={theme}
      onKeyDown={handleKeyDown}
    >
      <div id="notes-modal-title" className="sr-only">
        {isEdit ? 'Edit note' : 'Add note'}
      </div>
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-surface">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="min-w-0 w-full rounded-md border border-border bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Note title"
          />
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {canArchive && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-border transition-colors disabled:opacity-50"
              aria-label="Archive note"
            >
              <Trash2 className="size-4 shrink-0" />
              {archiving ? 'Archiving…' : 'Archive'}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted hover:text-foreground hover:bg-border transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted">
            Loading note…
          </div>
        ) : (
          <div className="notes-quill-wrapper flex-1 min-h-0 flex flex-col overflow-hidden">
            <QuillEditor
              value={body}
              onChange={handleQuillChange}
              placeholder="Write your note…"
              className="notes-quill-editor"
            />
          </div>
        )}
      </div>
    </div>
  );
}
