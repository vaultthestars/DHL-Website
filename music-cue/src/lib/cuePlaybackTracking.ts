import { GeneratedCue, Song } from "./types";

export type PlaybackAdvanceResult = {
  nextCue: GeneratedCue;
  cueIndex: number;
  message?: string;
};

/**
 * Updates the web cue based on a new track starting in Music.app.
 * Assumes editing happens in Music; the web cue passively follows playback.
 */
export const applyPlaybackAdvance = (
  cue: GeneratedCue,
  library: Song[],
  currentPersistentId: string,
  previousPersistentId: string | null,
  previousCueIndex: number
): PlaybackAdvanceResult => {
  if (previousPersistentId === currentPersistentId) {
    const stableIndex = cue.songs.findIndex((song) => song.id === currentPersistentId);
    return {
      nextCue: cue,
      cueIndex: stableIndex >= 0 ? stableIndex : previousCueIndex,
    };
  }

  let nextSongs = [...cue.songs];
  let message: string | undefined;

  const currentIndex = nextSongs.findIndex((song) => song.id === currentPersistentId);

  if (currentIndex >= 0) {
    if (previousCueIndex >= 0 && currentIndex > previousCueIndex + 1) {
      const removed = nextSongs.splice(previousCueIndex + 1, currentIndex - previousCueIndex - 1);
      const adjustedIndex = nextSongs.findIndex((song) => song.id === currentPersistentId);
      if (removed.length > 0) {
        message = `Skipped ${removed.length} track(s) in Music.app — removed from cue.`;
      }
      return {
        nextCue: { ...cue, songs: nextSongs },
        cueIndex: adjustedIndex,
        message,
      };
    }

    return {
      nextCue: cue,
      cueIndex: currentIndex,
    };
  }

  const librarySong = library.find((song) => song.id === currentPersistentId);
  if (!librarySong || previousCueIndex < 0) {
    return {
      nextCue: cue,
      cueIndex: previousCueIndex,
    };
  }

  const insertAt = previousCueIndex + 1;
  if (insertAt < nextSongs.length) {
    const skipped = nextSongs.splice(insertAt, 1)[0];
    if (skipped) {
      message = `Replaced ${skipped.title} with newly queued track in cue.`;
    }
  }

  nextSongs.splice(insertAt, 0, librarySong);
  return {
    nextCue: { ...cue, songs: nextSongs },
    cueIndex: insertAt,
    message: message ?? `Added ${librarySong.title} to cue from Music.app.`,
  };
};
