'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Video, Square, Upload, SwitchCamera } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { songApi } from '@/lib/api';
import {
  UPLOAD_MAX_VIDEO_BYTES,
  getUploadErrorMessage,
  uploadMaxMb,
} from '@/lib/uploadLimits';

type FacingMode = 'environment' | 'user';

export interface RecordVideoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  onSuccess: () => void;
}

export function RecordVideoDrawer({
  open,
  onOpenChange,
  songId,
  onSuccess,
}: RecordVideoDrawerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
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
    setCameraReady(false);
    setRecording(false);
  }, []);

  const startCamera = useCallback(async (facing: FacingMode) => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true,
      });
      streamRef.current = stream;
      setCameraReady(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access failed';
      setCameraError(message);
    }
  }, []);

  useEffect(() => {
    if (!open || !songId) return;
    let cancelled = false;
    const init = async () => {
      await startCamera(facingMode);
      if (cancelled) stopCamera();
    };
    init();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, songId]);

  // Attach stream to video once mounted
  useEffect(() => {
    if (!cameraReady || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [cameraReady]);

  const toggleCamera = useCallback(async () => {
    if (recording || uploading) return;
    const nextFacing: FacingMode = facingMode === 'environment' ? 'user' : 'environment';
    stopCamera();
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
  }, [facingMode, recording, uploading, stopCamera, startCamera]);

  const getVideoDuration = useCallback((blob: Blob): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (Number.isFinite(video.duration) && video.duration > 0) {
          resolve(video.duration);
        } else {
          reject(new Error('Could not read video duration'));
        }
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read video duration'));
      };
      video.src = url;
    });
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !songId) return;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(streamRef.current, options);
    chunksRef.current = [];
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
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      if (blob.size > UPLOAD_MAX_VIDEO_BYTES) {
        toast.error(
          `Recording is too large. Maximum size is ${uploadMaxMb(UPLOAD_MAX_VIDEO_BYTES)} MB. Try a shorter clip.`
        );
        setUploading(false);
        return;
      }
      setUploading(true);
      try {
        let durationSeconds: number | undefined;
        try {
          durationSeconds = await getVideoDuration(blob);
        } catch {
          // omit duration if we can't read it
        }
        await songApi.uploadSongVideo(songId, blob, { durationSeconds });
        onSuccess();
        onOpenChange(false);
        toast.success('Video saved');
      } catch (err) {
        toast.error(getUploadErrorMessage(err));
      } finally {
        setUploading(false);
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
  }, [songId, getVideoDuration, onSuccess, onOpenChange]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !songId) return;
      const okVideo =
        file.type.startsWith('video/webm') ||
        file.type.startsWith('video/mp4') ||
        file.type.startsWith('video/quicktime') ||
        file.type.startsWith('video/x-m4v');
      if (!okVideo) {
        toast.error('Please choose an MP4, WebM, or QuickTime (.mov) video.');
        return;
      }
      if (file.size > UPLOAD_MAX_VIDEO_BYTES) {
        toast.error(`File is too large. Maximum size is ${uploadMaxMb(UPLOAD_MAX_VIDEO_BYTES)} MB.`);
        return;
      }
      setUploading(true);
      try {
        let durationSeconds: number | undefined;
        try {
          durationSeconds = await getVideoDuration(file);
        } catch {
          // omit duration if we can't read it
        }
        await songApi.uploadSongVideo(songId, file, { durationSeconds });
        onSuccess();
        onOpenChange(false);
        toast.success('Video saved');
      } catch (err) {
        toast.error(getUploadErrorMessage(err));
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [songId, getVideoDuration, onSuccess, onOpenChange]
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Video</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 space-y-4">
          {cameraError && (
            <p className="text-sm text-muted-foreground">
              Camera unavailable: {cameraError}. You can choose a video file instead.
            </p>
          )}
          {cameraReady && (
            <div className="relative aspect-[4/3] max-h-[50vh] rounded-lg overflow-hidden bg-surface">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover${facingMode === 'user' ? ' -scale-x-100' : ''}`}
              />
              {recording && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">
                    Recording…
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={toggleCamera}
                disabled={recording || uploading}
                aria-label="Switch camera"
                className="absolute top-2 right-2 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-opacity hover:bg-black/70 disabled:opacity-40"
              >
                <SwitchCamera className="size-5" />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {cameraReady && (
              <>
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground px-4 py-3 font-medium disabled:opacity-60"
                  >
                    <Video className="size-5" />
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
              MP4, WebM, or MOV — max {uploadMaxMb(UPLOAD_MAX_VIDEO_BYTES)} MB. In-app recording uses WebM.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || recording}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface text-foreground px-4 py-3 font-medium hover:bg-accent/10 disabled:opacity-60"
            >
              <Upload className="size-5" />
              Choose video file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
