import { useState } from "react";
import { loadMediaSettings } from "@/components/chat/mobile/MediaSettingsMenu";

export type VideoDuration = 5 | 8 | 10 | 15;

/**
 * Encapsulates state for the video "start/end frame" generation flow.
 * Extracted from ChatPage to reduce re-render surface.
 */
export function useVideoFrames() {
  const [videoStartEndMode, setVideoStartEndMode] = useState(false);
  const [videoDurationSec, setVideoDurationSec] = useState<VideoDuration>(() => {
    const d = loadMediaSettings("video").duration;
    return (d === 8 || d === 10 || d === 15 ? d : 5) as VideoDuration;
  });
  const [startFrameUrl, setStartFrameUrl] = useState<string | null>(null);
  const [endFrameUrl, setEndFrameUrl] = useState<string | null>(null);
  const [frameUploading, setFrameUploading] = useState<null | "start" | "end">(null);

  return {
    videoStartEndMode,
    setVideoStartEndMode,
    videoDurationSec,
    setVideoDurationSec,
    startFrameUrl,
    setStartFrameUrl,
    endFrameUrl,
    setEndFrameUrl,
    frameUploading,
    setFrameUploading,
  };
}
