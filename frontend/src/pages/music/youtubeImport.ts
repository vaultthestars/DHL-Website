import { lookupAcousticFeatures, parseTitleAndArtist } from "./acousticFeatures";
import { Song } from "./types";

type OEmbedResponse = {
  title: string;
  author_name: string;
};

export type SongImportResult = {
  song: Song;
  featureSource: "acousticbrainz" | "default";
};

export const parseYoutubeVideoId = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const cleanChannelName = (authorName: string): string =>
  authorName.replace(/ - Topic$/i, "").trim();

const fetchOEmbed = async (videoId: string): Promise<OEmbedResponse> => {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Could not load metadata for ${videoId}`);
  }
  return response.json() as Promise<OEmbedResponse>;
};

export const importSongFromUrl = async (
  url: string,
  defaults: { energy: number; valence: number }
): Promise<SongImportResult> => {
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) {
    throw new Error(`Could not parse YouTube URL: ${url}`);
  }

  const metadata = await fetchOEmbed(videoId);
  const channelArtist = cleanChannelName(metadata.author_name);
  const parsed = parseTitleAndArtist(metadata.title.trim(), channelArtist);
  const artist = parsed.artist;
  const title = parsed.title;
  const id = `${slugify(`${artist}-${title}`)}-${videoId.slice(0, 6)}`;

  const acousticFeatures = await lookupAcousticFeatures(artist, title);
  const energy = acousticFeatures?.energy ?? defaults.energy;
  const valence = acousticFeatures?.valence ?? defaults.valence;

  return {
    song: {
      id,
      title,
      artist,
      youtubeVideoId: videoId,
      energy,
      valence,
    },
    featureSource: acousticFeatures ? "acousticbrainz" : "default",
  };
};

export const importSongsFromUrls = async (
  rawUrls: string,
  defaults: { energy: number; valence: number }
): Promise<{ songs: Song[]; errors: string[]; acousticbrainzCount: number }> => {
  const lines = rawUrls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const songs: Song[] = [];
  const errors: string[] = [];
  let acousticbrainzCount = 0;

  for (const line of lines) {
    try {
      const imported = await importSongFromUrl(line, defaults);
      songs.push(imported.song);
      if (imported.featureSource === "acousticbrainz") {
        acousticbrainzCount += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      errors.push(`${line}: ${message}`);
    }
  }

  return { songs, errors, acousticbrainzCount };
};
