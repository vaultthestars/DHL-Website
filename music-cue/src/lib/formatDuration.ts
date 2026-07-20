export const formatDuration = (totalMs: number): string => {
  if (totalMs <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.round(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
};

export const sumDuration = (songs: { durationMs?: number }[]): number =>
  songs.reduce((total, song) => total + (song.durationMs ?? 0), 0);
