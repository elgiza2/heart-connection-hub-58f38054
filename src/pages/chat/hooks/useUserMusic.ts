import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/lib/cachedUser";

export type UserTrack = { id: string; name: string; storage_path: string };

/**
 * Owns the "user music" feature for Study Mode: loading saved tracks,
 * uploading new ones, playing, and deleting. Lifted out of ChatPage to
 * keep that file focused on chat orchestration.
 */
export function useUserMusic(params: {
  studyAudioRef: MutableRefObject<HTMLAudioElement | null>;
  studyMusicKind: string | null;
  setStudyMusic: (next: { kind: string | null }) => void;
}) {
  const { studyAudioRef, studyMusicKind, setStudyMusic } = params;
  const [userTracks, setUserTracks] = useState<UserTrack[]>([]);
  const [uploadingMusic, setUploadingMusic] = useState(false);

  const loadUserTracks = useCallback(async () => {
    const user = await getCachedUser();
    if (!user) return;
    const { data } = await supabase
      .from("user_music_tracks")
      .select("id, name, storage_path")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setUserTracks(data as UserTrack[]);
  }, []);

  useEffect(() => {
    loadUserTracks();
  }, [loadUserTracks]);

  const playUserTrack = useCallback(
    async (track: UserTrack) => {
      const { data, error } = await supabase.storage
        .from("user-music")
        .createSignedUrl(track.storage_path, 3600);
      if (error || !data?.signedUrl) {
        toast.error("Failed to load track");
        return;
      }
      if (!studyAudioRef.current) studyAudioRef.current = new Audio();
      studyAudioRef.current.loop = true;
      studyAudioRef.current.src = data.signedUrl;
      studyAudioRef.current.volume = 0.5;
      studyAudioRef.current
        .play()
        .catch(() => toast.info(`Selected ${track.name} (audio blocked by browser)`));
      setStudyMusic({ kind: track.name });
    },
    [studyAudioRef, setStudyMusic],
  );

  const handleMusicUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("audio/")) {
        toast.error("Please choose an audio file");
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error("Max file size is 25MB");
        return;
      }
      const user = await getCachedUser();
      if (!user) {
        toast.error("Sign in required");
        return;
      }
      setUploadingMusic(true);
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("user-music")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const displayName = file.name.replace(/\.[^.]+$/, "");
        const { data: row, error: insErr } = await supabase
          .from("user_music_tracks")
          .insert({
            user_id: user.id,
            name: displayName,
            storage_path: path,
            size_bytes: file.size,
          })
          .select("id, name, storage_path")
          .single();
        if (insErr) throw insErr;
        const track = row as UserTrack;
        setUserTracks((prev) => [track, ...prev]);
        toast.success("Track saved");
        await playUserTrack(track);
      } catch (err: any) {
        toast.error(err?.message || "Upload failed");
      } finally {
        setUploadingMusic(false);
      }
    },
    [playUserTrack],
  );

  const deleteUserTrack = useCallback(
    async (track: UserTrack) => {
      await supabase.storage.from("user-music").remove([track.storage_path]);
      await supabase.from("user_music_tracks").delete().eq("id", track.id);
      setUserTracks((prev) => prev.filter((t) => t.id !== track.id));
      if (studyMusicKind === track.name) {
        if (studyAudioRef.current) {
          studyAudioRef.current.pause();
          studyAudioRef.current.src = "";
        }
        setStudyMusic({ kind: null });
      }
    },
    [studyAudioRef, studyMusicKind, setStudyMusic],
  );

  return {
    userTracks,
    uploadingMusic,
    loadUserTracks,
    playUserTrack,
    handleMusicUpload,
    deleteUserTrack,
  };
}
