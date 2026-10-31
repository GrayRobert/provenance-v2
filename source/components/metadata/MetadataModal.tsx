'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { songApi } from '@/lib/api';
import type { MetadataType, WorkMetadataItem } from '@/lib/types';
import { validateMetadataName, validateMetadataValue } from '@/lib/metadataValidation';
import { X, ArchiveRestore, Archive, RotateCcw } from 'lucide-react';

export interface MetadataModalProps {
  isOpen: boolean;
  songId: string;
  onClose: () => void;
  onSaveSuccess?: () => void;
  onSaveError?: (error: string) => void;
}

const CUSTOM_TYPE_NAME = 'Custom';

export default function MetadataModal({
  isOpen,
  songId,
  onClose,
  onSaveSuccess,
  onSaveError,
}: MetadataModalProps) {
  const [types, setTypes] = useState<MetadataType[]>([]);
  const [items, setItems] = useState<WorkMetadataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addNameType, setAddNameType] = useState<string>('');
  const [addCustomName, setAddCustomName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addShowOnTimeline, setAddShowOnTimeline] = useState(true);
  const addCustomNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addNameType === CUSTOM_TYPE_NAME) {
      addCustomNameInputRef.current?.focus();
    }
  }, [addNameType]);

  const load = useCallback(async () => {
    if (!songId) return;
    setLoading(true);
    try {
      const [typesData, itemsData] = await Promise.all([
        songApi.getMetadataTypes(),
        songApi.getSongMetadata(songId),
      ]);
      setTypes(typesData);
      setItems(itemsData);
      if (typesData.length > 0 && !addNameType) {
        const firstNonCustom = typesData.find((t) => t.name !== CUSTOM_TYPE_NAME);
        setAddNameType(firstNonCustom?.name ?? typesData[0].name);
      }
    } catch (e) {
      onSaveError?.((e as Error).message ?? 'Failed to load metadata');
    } finally {
      setLoading(false);
    }
  }, [songId, onSaveError]);

  useEffect(() => {
    if (isOpen && songId) load();
  }, [isOpen, songId, load]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  const handleAdd = useCallback(async () => {
    const name = addNameType === CUSTOM_TYPE_NAME ? addCustomName.trim() : addNameType;
    const nameCheck = validateMetadataName(name);
    if (!nameCheck.valid) {
      onSaveError?.(nameCheck.error ?? 'Invalid name');
      return;
    }
    const valueCheck = validateMetadataValue(addValue);
    if (!valueCheck.valid) {
      onSaveError?.(valueCheck.error ?? 'Invalid value');
      return;
    }
    setAdding(true);
    try {
      await songApi.addMetadataItem(songId, {
        name,
        value: addValue.trim(),
        showOnTimeline: addShowOnTimeline,
      });
      setAddValue('');
      setAddShowOnTimeline(true);
      onSaveSuccess?.();
      load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : 'Failed to add');
      onSaveError?.(msg);
    } finally {
      setAdding(false);
    }
  }, [songId, addNameType, addCustomName, addValue, addShowOnTimeline, load, onSaveSuccess, onSaveError]);

  const handleEdit = useCallback(
    async (item: WorkMetadataItem, updates: { name?: string; value?: string; showOnTimeline?: boolean }) => {
      const name = updates.name !== undefined ? updates.name : item.name;
      const value = updates.value !== undefined ? updates.value : item.value;
      if (updates.name !== undefined) {
        const nameCheck = validateMetadataName(name);
        if (!nameCheck.valid) {
          onSaveError?.(nameCheck.error ?? 'Invalid name');
          return;
        }
      }
      if (updates.value !== undefined) {
        const valueCheck = validateMetadataValue(value);
        if (!valueCheck.valid) {
          onSaveError?.(valueCheck.error ?? 'Invalid value');
          return;
        }
      }
      try {
        await songApi.editMetadataItem(songId, item.itemId, {
          name: updates.name !== undefined ? name.trim() : undefined,
          value: updates.value !== undefined ? value.trim() : undefined,
          showOnTimeline: updates.showOnTimeline,
        });
        onSaveSuccess?.();
        load();
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (e instanceof Error ? e.message : 'Failed to save');
        onSaveError?.(msg);
      }
    },
    [songId, load, onSaveSuccess, onSaveError]
  );

  const handleArchive = useCallback(
    async (item: WorkMetadataItem) => {
      if (item.archivedAt) return;
      try {
        await songApi.archiveMetadataItem(songId, item.itemId);
        onSaveSuccess?.();
        load();
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (e instanceof Error ? e.message : 'Failed to archive');
        onSaveError?.(msg);
      }
    },
    [songId, load, onSaveSuccess, onSaveError]
  );

  const handleUnarchive = useCallback(
    async (item: WorkMetadataItem) => {
      if (!item.archivedAt) return;
      try {
        await songApi.unarchiveMetadataItem(songId, item.itemId);
        onSaveSuccess?.();
        load();
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (e instanceof Error ? e.message : 'Failed to unarchive');
        onSaveError?.(msg);
      }
    },
    [songId, load, onSaveSuccess, onSaveError]
  );

  const firstPredefinedType = types.find((t) => t.name !== CUSTOM_TYPE_NAME)?.name ?? types[0]?.name ?? '';
  const handleResetAddNameToDropdown = useCallback(() => {
    setAddNameType(firstPredefinedType);
    setAddCustomName('');
  }, [firstPredefinedType]);

  if (!isOpen) return null;

  const nonArchived = items.filter((i) => !i.archivedAt);
  const archived = items.filter((i) => i.archivedAt);
  const isAddValid =
    (addNameType === CUSTOM_TYPE_NAME ? addCustomName.trim().length > 0 : addNameType.length > 0) &&
    validateMetadataName(addNameType === CUSTOM_TYPE_NAME ? addCustomName : addNameType).valid &&
    validateMetadataValue(addValue).valid;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden w-full h-full max-w-[100vw] max-h-[100dvh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="metadata-modal-title"
      onKeyDown={handleKeyDown}
    >
      <div id="metadata-modal-title" className="sr-only">
        Work metadata
      </div>
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-surface">
        <h2 className="text-lg font-semibold text-foreground">Work metadata</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-2 text-muted hover:text-foreground hover:bg-border transition-colors"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted">
            Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {/* Add new row */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Add metadata</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_auto_auto] gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Name</label>
                  {addNameType === CUSTOM_TYPE_NAME ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        ref={addCustomNameInputRef}
                        type="text"
                        value={addCustomName}
                        onChange={(e) => setAddCustomName(e.target.value)}
                        placeholder="Custom name"
                        className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <button
                        type="button"
                        onClick={handleResetAddNameToDropdown}
                        className="shrink-0 p-2 rounded-md border border-border text-muted hover:text-foreground hover:bg-border/50 transition-colors"
                        title="Choose from list"
                        aria-label="Choose from list"
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={addNameType}
                      onChange={(e) => setAddNameType(e.target.value)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      {types.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1 min-w-0">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider">Value</label>
                  <input
                    type="text"
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    placeholder="Value"
                    className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="add-show-timeline"
                    checked={addShowOnTimeline}
                    onChange={(e) => setAddShowOnTimeline(e.target.checked)}
                    className="rounded border-border"
                  />
                  <label htmlFor="add-show-timeline" className="text-sm text-foreground">
                    Show on timeline
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding || !isAddValid}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border bg-surface overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted w-0 min-w-[120px]">
                      Name
                    </th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
                      Value
                    </th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted w-32 shrink-0">
                      Timeline
                    </th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted w-20 shrink-0">
                      Archive
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {nonArchived.length === 0 && archived.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                        No metadata yet. Add a row above.
                      </td>
                    </tr>
                  )}
                  {nonArchived.map((item) => (
                    <MetadataRow
                      key={item.itemId}
                      item={item}
                      types={types}
                      onEdit={handleEdit}
                      onArchive={handleArchive}
                    />
                  ))}
                  {archived.map((item) => (
                    <tr key={item.itemId} className="border-t border-border bg-muted/10">
                      <td className="px-4 py-2 text-sm text-muted">{item.name}</td>
                      <td className="px-4 py-2 text-sm text-muted break-words min-w-0">
                        {item.value || '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted">—</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleUnarchive(item)}
                          className="p-2 text-muted hover:text-foreground rounded transition-colors"
                          aria-label="Unarchive"
                          title="Unarchive"
                        >
                          <ArchiveRestore className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetadataRow({
  item,
  types,
  onEdit,
  onArchive,
}: {
  item: WorkMetadataItem;
  types: MetadataType[];
  onEdit: (item: WorkMetadataItem, u: { name?: string; value?: string; showOnTimeline?: boolean }) => void;
  onArchive: (item: WorkMetadataItem) => void;
}) {
  const [nameMode, setNameMode] = useState<'select' | 'custom'>(() =>
    types.some((t) => t.name === item.name) ? 'select' : 'custom'
  );
  const [nameSelect, setNameSelect] = useState(item.name);
  const [nameCustom, setNameCustom] = useState(item.name);
  const [value, setValue] = useState(item.value);
  const [showOnTimeline, setShowOnTimeline] = useState(item.showOnTimeline);
  const customNameInputRef = useRef<HTMLInputElement>(null);

  const currentName = nameMode === 'custom' ? nameCustom : nameSelect;
  const isCustom = !types.some((t) => t.name === item.name);

  useEffect(() => {
    if (nameMode === 'custom') {
      customNameInputRef.current?.focus();
    }
  }, [nameMode]);

  useEffect(() => {
    if (isCustom) {
      setNameMode('custom');
      setNameCustom(item.name);
    } else {
      setNameSelect(item.name);
    }
    setValue(item.value);
    setShowOnTimeline(item.showOnTimeline);
  }, [item.itemId, item.name, item.value, item.showOnTimeline, isCustom]);

  const handleBlurName = () => {
    const name = nameMode === 'custom' ? nameCustom.trim() : nameSelect;
    if (name && name !== item.name) {
      const res = validateMetadataName(name);
      if (res.valid) onEdit(item, { name });
    }
  };

  const handleBlurValue = () => {
    const v = value ?? '';
    if (v !== item.value) {
      const res = validateMetadataValue(v);
      if (res.valid) onEdit(item, { value: v });
    }
  };

  const handleTimelineToggle = () => {
    const next = !showOnTimeline;
    setShowOnTimeline(next);
    onEdit(item, { showOnTimeline: next });
  };

  const firstPredefinedType = types.find((t) => t.name !== CUSTOM_TYPE_NAME)?.name ?? types[0]?.name ?? '';
  const handleResetToDropdown = () => {
    setNameMode('select');
    setNameSelect(firstPredefinedType);
  };

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2 min-w-0">
        {nameMode === 'custom' ? (
          <div className="flex items-center gap-2 min-w-0">
            <input
              ref={customNameInputRef}
              type="text"
              value={nameCustom}
              onChange={(e) => setNameCustom(e.target.value)}
              onBlur={handleBlurName}
              className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="button"
              onClick={handleResetToDropdown}
              className="shrink-0 p-1.5 rounded text-muted hover:text-foreground hover:bg-border/50 transition-colors"
              title="Choose from list"
              aria-label="Reset to dropdown"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>
        ) : (
          <select
            value={nameSelect}
            onChange={(e) => {
              const v = e.target.value;
              if (v === CUSTOM_TYPE_NAME) {
                setNameMode('custom');
                setNameCustom(item.name);
              } else {
                setNameSelect(v);
                if (v !== item.name) onEdit(item, { name: v });
              }
            }}
            onBlur={handleBlurName}
            className="w-full min-w-[120px] rounded border border-border bg-background px-2 py-1.5 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {types.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-2 min-w-0">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlurValue}
          placeholder="—"
          className="w-full min-w-0 rounded border border-border bg-background px-2 py-1.5 text-base md:text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </td>
      <td className="px-4 py-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnTimeline}
            onChange={handleTimelineToggle}
            className="rounded border-border"
          />
          <span className="text-sm text-foreground">{showOnTimeline ? 'Show' : 'Hide'}</span>
        </label>
      </td>
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={() => onArchive(item)}
          className="p-2 text-muted hover:text-foreground rounded transition-colors"
          aria-label="Archive"
          title="Archive"
        >
          <Archive className="size-4" />
        </button>
      </td>
    </tr>
  );
}
