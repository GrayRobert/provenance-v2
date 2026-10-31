'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { songApi } from '@/lib/api';
import {
  UPLOAD_MAX_LYRICS_SCAN_BYTES,
  getUploadErrorMessage,
  uploadMaxMb,
} from '@/lib/uploadLimits';

export interface ScanLyricsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  onSuccess: () => void;
}

export function ScanLyricsDrawer({
  open,
  onOpenChange,
  songId,
  onSuccess,
}: ScanLyricsDrawerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Start camera when drawer opens
  useEffect(() => {
    if (!open || !songId) return;
    setCameraError(null);
    let cancelled = false;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraReady(true);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Camera access failed';
        setCameraError(message);
      }
    };
    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, songId, stopCamera]);

  // Attach stream to video once it's mounted (video only exists in DOM when cameraReady is true)
  useEffect(() => {
    if (!cameraReady || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [cameraReady]);

  const captureAndUpload = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !songId) return;
    setUploading(true);
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });
      if (!blob) throw new Error('Failed to create image');
      if (blob.size > UPLOAD_MAX_LYRICS_SCAN_BYTES) {
        throw new Error(
          `Image is too large. Maximum size is ${uploadMaxMb(UPLOAD_MAX_LYRICS_SCAN_BYTES)} MB.`
        );
      }
      await songApi.uploadLyricsScan(songId, blob);
      onSuccess();
      onOpenChange(false);
      toast.success('Lyrics scan saved');
    } catch (err) {
      toast.error(getUploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }, [songId, onSuccess, onOpenChange]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !songId) return;
      const okType =
        file.type.startsWith('image/jpeg') ||
        file.type.startsWith('image/png') ||
        file.type.startsWith('image/webp');
      if (!okType) {
        toast.error('Please choose a JPEG, PNG, or WebP image.');
        return;
      }
      if (file.size > UPLOAD_MAX_LYRICS_SCAN_BYTES) {
        toast.error(`Image is too large. Maximum size is ${uploadMaxMb(UPLOAD_MAX_LYRICS_SCAN_BYTES)} MB.`);
        return;
      }
      setUploading(true);
      try {
        await songApi.uploadLyricsScan(songId, file);
        onSuccess();
        onOpenChange(false);
        toast.success('Lyrics scan saved');
      } catch (err) {
        toast.error(getUploadErrorMessage(err));
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [songId, onSuccess, onOpenChange]
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Scan hand written lyrics</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 space-y-4">
          {cameraError && (
            <p className="text-sm text-muted-foreground">
              Camera unavailable: {cameraError}. You can choose an image file instead.
            </p>
          )}
          {cameraReady && (
            <div className="relative aspect-[4/3] max-h-[50vh] rounded-lg overflow-hidden bg-surface">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            {cameraReady && (
              <button
                type="button"
                onClick={captureAndUpload}
                disabled={uploading}
                className="flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground px-4 py-3 font-medium disabled:opacity-60"
              >
                <Camera className="size-5" />
                {uploading ? 'Uploading…' : 'Capture & save'}
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, or WebP — max {uploadMaxMb(UPLOAD_MAX_LYRICS_SCAN_BYTES)} MB per file.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface text-foreground px-4 py-3 font-medium hover:bg-accent/10 disabled:opacity-60"
            >
              <Upload className="size-5" />
              Choose image file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
