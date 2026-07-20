import { LibraryStats, Song } from "./types";
import { EXCLUDED_PLAYLIST_NAMES } from "./playlistConstants";

const getText = (track: Record<string, unknown>, key: string): string => {
  const value = track[key];
  return typeof value === "string" ? value : "";
};

const getNumber = (track: Record<string, unknown>, key: string, fallback = 0): number => {
  const value = track[key];
  return typeof value === "number" ? value : fallback;
};

const getBoolean = (track: Record<string, unknown>, key: string): boolean => track[key] === true;

const parsePlistValue = (element: Element): unknown => {
  const tag = element.tagName.toLowerCase();
  if (tag === "string") {
    return element.textContent ?? "";
  }
  if (tag === "integer" || tag === "real") {
    return Number(element.textContent ?? 0);
  }
  if (tag === "true") {
    return true;
  }
  if (tag === "false") {
    return false;
  }
  if (tag === "date") {
    return element.textContent ?? "";
  }
  if (tag === "dict") {
    return parsePlistDict(element);
  }
  if (tag === "array") {
    return Array.from(element.children).map((child) => parsePlistValue(child));
  }
  return element.textContent ?? "";
};

const parsePlistDict = (dictElement: Element): Record<string, unknown> => {
  const children = Array.from(dictElement.children);
  const result: Record<string, unknown> = {};
  for (let index = 0; index < children.length; index += 2) {
    const keyElement = children[index];
    const valueElement = children[index + 1];
    if (!keyElement || !valueElement || keyElement.tagName.toLowerCase() !== "key") {
      continue;
    }
    const key = keyElement.textContent ?? "";
    result[key] = parsePlistValue(valueElement);
  }
  return result;
};

const isMusicTrack = (track: Record<string, unknown>): boolean => {
  const trackType = getText(track, "Track Type");
  if (trackType === "Podcast" || trackType === "PDF Podcast") {
    return false;
  }

  const name = getText(track, "Name");
  if (!name) {
    return false;
  }

  const kind = getText(track, "Kind").toLowerCase();
  if (kind.includes("pdf") || kind.includes("book")) {
    return false;
  }

  return true;
};

const deriveArtist = (track: Record<string, unknown>): string => {
  const artist = getText(track, "Artist");
  if (artist) {
    return artist;
  }
  const albumArtist = getText(track, "Album Artist");
  if (albumArtist) {
    return albumArtist;
  }
  const composer = getText(track, "Composer");
  if (composer) {
    return composer;
  }
  return "Unknown Artist";
};

const deriveAlbum = (track: Record<string, unknown>): string => getText(track, "Album") || "Unknown Album";

const SYSTEM_PLAYLIST_NAMES = EXCLUDED_PLAYLIST_NAMES;

const isExcludedPlaylist = (playlist: Record<string, unknown>): boolean => {
  if (getBoolean(playlist, "Master")) {
    return true;
  }
  const name = getText(playlist, "Name");
  if (!name || SYSTEM_PLAYLIST_NAMES.has(name)) {
    return true;
  }
  if (name.startsWith("MusicCue-") || name.startsWith("MusicCue —")) {
    return true;
  }
  return false;
};

const getPlaylistTrackIds = (playlist: Record<string, unknown>): number[] => {
  const items = playlist["Playlist Items"];
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => getNumber(item, "Track ID"))
    .filter((trackId) => trackId > 0);
};

const parseYearFromDateAdded = (dateAdded: string): number => {
  if (!dateAdded) {
    return new Date().getFullYear();
  }
  const parsed = Date.parse(dateAdded);
  if (Number.isNaN(parsed)) {
    return new Date().getFullYear();
  }
  return new Date(parsed).getFullYear();
};

const trackToSong = (track: Record<string, unknown>): Song => {
  const persistentId = getText(track, "Persistent ID");
  const trackId = getNumber(track, "Track ID");
  const id = persistentId || `track-${trackId}`;
  const releaseYear = getNumber(track, "Year");
  const dateAdded = getText(track, "Date Added");
  const genre = getText(track, "Genre") || "Unknown";

  return {
    id,
    title: getText(track, "Name"),
    artist: deriveArtist(track),
    album: deriveAlbum(track),
    genre,
    year: releaseYear > 0 ? releaseYear : parseYearFromDateAdded(dateAdded),
    yearFromDateAdded: releaseYear <= 0,
    playCount: getNumber(track, "Play Count"),
    rating: getNumber(track, "Rating"),
    loved: getBoolean(track, "Loved") || getBoolean(track, "Favorited"),
    dateAdded: getText(track, "Date Added"),
    trackType: getText(track, "Track Type") || "Unknown",
    durationMs: getNumber(track, "Total Time"),
    playlists: [],
  };
};

export const parseLibraryXml = (xml: string): { songs: Song[]; stats: LibraryStats } => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("Could not parse Library.xml.");
  }

  const rootDict = document.querySelector("plist > dict");
  if (!rootDict) {
    throw new Error("Library.xml is missing the root plist dictionary.");
  }

  const root = parsePlistDict(rootDict);
  const tracksContainer = root.Tracks;
  if (!tracksContainer || typeof tracksContainer !== "object") {
    throw new Error("Library.xml does not contain a Tracks section.");
  }

  const songs = Object.values(tracksContainer as Record<string, unknown>)
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .filter(isMusicTrack)
    .map(trackToSong);

  const trackIdToSongId = new Map<number, string>();
  Object.values(tracksContainer as Record<string, unknown>).forEach((entry) => {
    if (typeof entry !== "object" || entry === null || !isMusicTrack(entry)) {
      return;
    }
    const trackId = getNumber(entry, "Track ID");
    const persistentId = getText(entry, "Persistent ID");
    const songId = persistentId || `track-${trackId}`;
    if (trackId > 0) {
      trackIdToSongId.set(trackId, songId);
    }
  });

  const playlistMembership = new Map<string, Set<string>>();
  const playlistNames: Record<string, string> = {};
  const playlistIds: string[] = [];
  const playlistsContainer = root.Playlists;
  if (Array.isArray(playlistsContainer)) {
    playlistsContainer
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .filter((playlist) => !isExcludedPlaylist(playlist))
      .forEach((playlist) => {
        const playlistId = getText(playlist, "Playlist Persistent ID") || `playlist-${getNumber(playlist, "Playlist ID")}`;
        const playlistName = getText(playlist, "Name");
        if (!playlistId || !playlistName) {
          return;
        }
        playlistNames[playlistId] = playlistName;
        playlistIds.push(playlistId);
        getPlaylistTrackIds(playlist).forEach((trackId) => {
          const songId = trackIdToSongId.get(trackId);
          if (!songId) {
            return;
          }
          const memberships = playlistMembership.get(songId) ?? new Set<string>();
          memberships.add(playlistId);
          playlistMembership.set(songId, memberships);
        });
      });
  }

  const songsWithPlaylists = songs.map((song) => ({
    ...song,
    playlists: [...(playlistMembership.get(song.id) ?? new Set<string>())].sort((left, right) =>
      (playlistNames[left] ?? left).localeCompare(playlistNames[right] ?? right)
    ),
  }));

  const years = songsWithPlaylists.map((song) => song.year);
  const playCounts = songsWithPlaylists.map((song) => song.playCount);
  const genres = [...new Set(songsWithPlaylists.map((song) => song.genre))].sort((a, b) => a.localeCompare(b));
  const genreCounts: Record<string, number> = {};
  songsWithPlaylists.forEach((song) => {
    genreCounts[song.genre] = (genreCounts[song.genre] ?? 0) + 1;
  });
  const playlistCounts: Record<string, number> = {};
  songsWithPlaylists.forEach((song) => {
    song.playlists.forEach((playlistId) => {
      playlistCounts[playlistId] = (playlistCounts[playlistId] ?? 0) + 1;
    });
  });
  const sortedPlaylistIds = [...playlistIds].sort((left, right) =>
    (playlistNames[left] ?? left).localeCompare(playlistNames[right] ?? right)
  );

  return {
    songs: songsWithPlaylists,
    stats: {
      minYear: years.length > 0 ? Math.min(...years) : 1970,
      maxYear: years.length > 0 ? Math.max(...years) : new Date().getFullYear(),
      genres,
      genreCounts,
      maxPlayCount: playCounts.length > 0 ? Math.max(...playCounts) : 1,
      playlistIds: sortedPlaylistIds,
      playlistNames,
      playlistCounts,
    },
  };
};
