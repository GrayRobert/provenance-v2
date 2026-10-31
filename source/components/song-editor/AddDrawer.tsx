'use client';

import { AudioLines, FileAudio, Video, Camera, StickyNote, Tags } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

const NOT_IMPLEMENTED_MESSAGE = 'Not implemented yet';

export interface AddDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When "Add Notes" is clicked, open the notes modal (caller renders NotesModal). */
  onOpenNotes?: () => void;
  /** When "Scan hand written lyrics" is clicked, open the scan lyrics drawer (caller renders ScanLyricsDrawer). */
  onOpenScanLyrics?: () => void;
  /** When "Add Video" is clicked, open the record video drawer (caller renders RecordVideoDrawer). */
  onOpenAddVideo?: () => void;
  /** When "Add Audio" is clicked, open the record audio drawer (caller renders RecordAudioDrawer). */
  onOpenAddAudio?: () => void;
  /** When "Add Metadata" is clicked, open the metadata modal (caller renders MetadataModal). */
  onOpenMetadata?: () => void;
  /** When "Track Lab" is clicked, open Track Lab in new-project mode (caller renders AudioRecorderModal). */
  onOpenTrackLab?: () => void;
  isReadOnly?: boolean;
}

export function AddDrawer({
  open,
  onOpenChange,
  onOpenNotes,
  onOpenScanLyrics,
  onOpenAddVideo,
  onOpenAddAudio,
  onOpenMetadata,
  onOpenTrackLab,
  isReadOnly = false,
}: AddDrawerProps) {
  const handleAddMetadata = () => {
    onOpenChange(false);
    if (onOpenMetadata) {
      onOpenMetadata();
    } else {
      toast(NOT_IMPLEMENTED_MESSAGE);
    }
  };

  const handleAddNotes = () => {
    onOpenChange(false);
    if (onOpenNotes) {
      onOpenNotes();
    } else {
      toast(NOT_IMPLEMENTED_MESSAGE);
    }
  };

  const handleScanLyrics = () => {
    onOpenChange(false);
    if (onOpenScanLyrics) {
      onOpenScanLyrics();
    } else {
      toast(NOT_IMPLEMENTED_MESSAGE);
    }
  };

  const handleAddVideo = () => {
    onOpenChange(false);
    if (onOpenAddVideo) {
      onOpenAddVideo();
    } else {
      toast(NOT_IMPLEMENTED_MESSAGE);
    }
  };

  const handleAddAudio = () => {
    onOpenChange(false);
    if (onOpenAddAudio) {
      onOpenAddAudio();
    } else {
      toast(NOT_IMPLEMENTED_MESSAGE);
    }
  };

  const handleTrackLab = () => {
    onOpenChange(false);
    if (onOpenTrackLab) {
      onOpenTrackLab();
    } else {
      toast(NOT_IMPLEMENTED_MESSAGE);
    }
  };

  const handleNotImplemented = () => {
    toast(NOT_IMPLEMENTED_MESSAGE);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-1 px-4 pb-8">
          <AddOption
            icon={<FileAudio className="size-5" />}
            label="Add Audio"
            description="Record or upload an audio track"
            onClick={handleAddAudio}
            disabled={isReadOnly}
          />
          <AddOption
            icon={<Video className="size-5" />}
            label="Add Video"
            description="Record or upload a video clip"
            onClick={handleAddVideo}
            disabled={isReadOnly}
          />
          <AddOption
            icon={<AudioLines className="size-5" />}
            label="Track Lab"
            description="Multitrack recording and mixing"
            onClick={handleTrackLab}
            disabled={isReadOnly}
          />
          <AddOption
            icon={<Camera className="size-5" />}
            label="Scan hand written lyrics"
            description="Take a photo of hand-written lyrics"
            onClick={handleScanLyrics}
            disabled={isReadOnly}
          />
          <AddOption
            icon={<StickyNote className="size-5" />}
            label="Add Notes"
            description="Free-form notes and annotations"
            onClick={handleAddNotes}
            disabled={isReadOnly}
          />
          <AddOption
            icon={<Tags className="size-5" />}
            label="Add Metadata"
            description="Album, ISRC, genre, and other work details"
            onClick={handleAddMetadata}
            disabled={isReadOnly}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function AddOption({
  icon,
  label,
  description,
  onClick,
  disabled,
  comingSoon,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-4 rounded-lg px-3 py-3.5 text-left transition-colors',
        !disabled && !comingSoon && 'hover:bg-accent/10',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
        {icon}
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {comingSoon ? 'Coming soon' : description}
        </span>
      </div>
    </button>
  );
}
