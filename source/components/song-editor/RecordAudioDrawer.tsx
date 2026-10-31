'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { songApi } from '@/lib/api';
import {
  UPLOAD_MAX_AUDIO_BYTES,
  getUploadErrorMessage,
  uploadMaxMb,
} from '@/lib/uploadLimits';

/**
 * Recording formats in preference order. Safari (iOS) records MP4/AAC and does
 * not support WebM capture, so negotiate with isTypeSupported instead of
 * hard-coding WebM/opus.
 */
const RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  for (const candidate of RECORDING_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // keep trying the next candidate
    }
  }
  return '';
}

export interface RecordAudioDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  /** When set, the recording is attached to this section (one primary per section). */
  sectionId?: string | null;
  /** Display label, e.g. the section title. */
  recordingLabel?: string | null;
  onSuccess: () => void;
}

export function RecordAudioDrawer({
  open,
  onOpenChange,
  songId,
  sectionId = null,
  recordingLabel = null,
  onSuccess,
}: RecordAudioDrawerProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [takeName, setTakeName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopMic = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setMicReady(false);
    setRecording(false);
  }, []);

  useEffect(() => {
    if (!open || !songId) return;
    setMicError(null);
    setTakeName(recordingLabel ?? '');
    let cancelled = false;
    const startMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMicReady(true);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Microphone access failed';
        setMicError(message);
      }
    };
    startMic();
    return () => {
      cancelled = true;
      stopMic();
    };
  }, [open, songId, recordingLabel, stopMic]);

  const getNextTrackIndex = useCallback(async (): Promise<number> => {
    const list = await songApi.getRecordings(songId);
    if (list.length === 0) return 0;
    const max = Math.max(...list.map((r) => r.trackIndex), -1);
    return max + 1;
  }, [songId]);

  const recordingStartRef = useRef<number>(0);

  /** Name options for saving: a name the user edited themselves is stored
   * as-is; the untouched default keeps the automatic version suffix. */
  const takeNameOptions = useCallback((): { label?: string; labelIsCustom?: boolean } => {
    const trimmed = takeName.trim();
    const defaultLabel = (recordingLabel ?? '').trim();
    if (trimmed && trimmed !== defaultLabel) {
      return { label: trimmed, labelIsCustom: true };
    }
    return { label: defaultLabel || undefined };
  }, [takeName, recordingLabel]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !songId) return;
    const mimeType = pickRecordingMimeType();
    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(streamRef.current, options);
    chunksRef.current = [];
    recordingStartRef.current = Date.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      recorderRef.current = null;
      setRecording(false);
      if (chunksRef.current.length === 0) {
        toast.error('No recording data');
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
      if (blob.size > UPLOAD_MAX_AUDIO_BYTES) {
        toast.error(
          `Recording is too large. Maximum size is ${uploadMaxMb(UPLOAD_MAX_AUDIO_BYTES)} MB. Try a shorter take.`
        );
        setUploading(false);
        return;
      }
      const elapsed = (Date.now() - recordingStartRef.current) / 1000;
      const durationSeconds = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : undefined;
      setUploading(true);
      try {
        const trackIndex = await getNextTrackIndex();
        await songApi.uploadRecording(songId, blob, {
          trackIndex,
          durationSeconds,
          sectionId: sectionId ?? undefined,
          ...takeNameOptions(),
        });
        onSuccess();
        onOpenChange(false);
        toast.success('Audio saved');
      } catch (err) {
        toast.error(getUploadErrorMessage(err));
      } finally {
        setUploading(false);
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
  }, [songId, sectionId, takeNameOptions, getNextTrackIndex, onSuccess, onOpenChange]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const getAudioDuration = useCallback((file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          resolve(audio.duration);
        } else {
          reject(new Error('Could not read audio duration'));
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read audio duration'));
      };
      audio.src = url;
    });
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !songId) return;
      const okAudio =
        !file.type ||
        file.type.startsWith('audio/mpeg') ||
        file.type === 'audio/mp4' ||
        file.type === 'audio/x-m4a' ||
        file.type.startsWith('audio/ogg') ||
        file.type.startsWith('audio/webm') ||
        file.type.startsWith('audio/aac');
      if (!okAudio) {
        toast.error('Please choose MP3, M4A, AAC, OGG, or WebM (WAV/FLAC not accepted).');
        return;
      }
      if (file.size > UPLOAD_MAX_AUDIO_BYTES) {
        toast.error(`File is too large. Maximum size is ${uploadMaxMb(UPLOAD_MAX_AUDIO_BYTES)} MB.`);
        return;
      }
      setUploading(true);
      try {
        const trackIndex = await getNextTrackIndex();
        let durationSeconds: number | undefined;
        try {
          durationSeconds = await getAudioDuration(file);
        } catch {
          // omit duration if we can't read it
        }
        await songApi.uploadRecording(songId, file, {
          trackIndex,
          durationSeconds,
          sectionId: sectionId ?? undefined,
          ...takeNameOptions(),
        });
        onSuccess();
        onOpenChange(false);
        toast.success('Audio saved');
      } catch (err) {
        toast.error(getUploadErrorMessage(err));
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [songId, sectionId, takeNameOptions, getNextTrackIndex, getAudioDuration, onSuccess, onOpenChange]
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{sectionId && recordingLabel ? `Record: ${recordingLabel}` : 'Add Audio'}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 space-y-4">
          {micError && (
            <p className="text-sm text-muted-foreground">
              Microphone unavailable: {micError}. You can choose an audio file instead.
            </p>
          )}
          {micReady && (
            <div className="flex items-center justify-center py-4 rounded-lg bg-surface border border-border">
              {recording ? (
                <span className="text-sm font-medium text-red-600">Recording…</span>
              ) : (
                <Mic className="size-8 text-muted" aria-hidden />
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="space-y-1">
              <label htmlFor="take-name" className="text-xs font-medium text-muted-foreground">
                Name this take
              </label>
              <input
                id="take-name"
                type="text"
                value={takeName}
                onChange={(e) => setTakeName(e.target.value)}
                placeholder={sectionId ? 'e.g. Verse idea' : 'e.g. Demo idea'}
                maxLength={80}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            {micReady && (
              <>
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground px-4 py-3 font-medium disabled:opacity-60"
                  >
                    <Mic className="size-5" />
                    Record
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-4 py-3 font-medium disabled:opacity-60"
                  >
                    <Square className="size-5" />
                    Stop & save
                  </button>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Uploads: MP3, M4A, AAC, OGG, or WebM — max {uploadMaxMb(UPLOAD_MAX_AUDIO_BYTES)} MB. WAV/FLAC
              not accepted. In-app recording uses your browser's format (WebM, or MP4/AAC on iPhone).
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface text-foreground px-4 py-3 font-medium hover:bg-accent/10 disabled:opacity-60"
            >
              <Upload className="size-5" />
              Choose audio file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/webm,.mp3,.m4a,.aac,.ogg,.webm"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
