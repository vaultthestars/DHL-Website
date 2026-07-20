const MUSICBRAINZ_USER_AGENT = "DHL-Website/1.0 (music-cue-tool)";

type MusicBrainzRecordingSearch = {
  recordings?: Array<{
    id: string;
    title: string;
    score: number;
  }>;
};

type MoodClassifier = {
  all?: Record<string, number>;
};

type AcousticBrainzHighLevel = {
  highlevel?: {
    danceability?: MoodClassifier;
    mood_aggressive?: MoodClassifier;
    mood_happy?: MoodClassifier;
    mood_party?: MoodClassifier;
    mood_relaxed?: MoodClassifier;
    mood_sad?: MoodClassifier;
  };
};

type AcousticBrainzLowLevel = {
  lowlevel?: {
    average_loudness?: number;
    dynamic_complexity?: number;
  };
  rhythm?: {
    onset_rate?: number;
    bpm?: number;
  };
};

export type DerivedAcousticFeatures = {
  energy: number;
  valence: number;
  source: "acousticbrainz";
  recordingId: string;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalize = (value: number, min: number, max: number): number => {
  if (max <= min) {
    return 0.5;
  }
  return clamp01((value - min) / (max - min));
};

const moodScore = (classifier: MoodClassifier | undefined, positiveKey: string): number | null => {
  const value = classifier?.all?.[positiveKey];
  return typeof value === "number" ? value : null;
};

const averageScores = (scores: Array<number | null>, fallback: number): number => {
  const valid = scores.filter((score): score is number => score !== null);
  if (valid.length === 0) {
    return fallback;
  }
  return valid.reduce((sum, score) => sum + score, 0) / valid.length;
};

export const deriveEnergyAndValence = (
  highLevel: AcousticBrainzHighLevel,
  lowLevel?: AcousticBrainzLowLevel
): { energy: number; valence: number } => {
  const high = highLevel.highlevel;

  const valence = clamp01(
    averageScores(
      [
        moodScore(high?.mood_happy, "happy"),
        moodScore(high?.mood_relaxed, "relaxed"),
        moodScore(high?.mood_sad, "sad") !== null ? 1 - (moodScore(high?.mood_sad, "sad") as number) : null,
      ],
      0.5
    )
  );

  const energy = clamp01(
    averageScores(
      [
        moodScore(high?.mood_aggressive, "aggressive"),
        moodScore(high?.mood_party, "party"),
        moodScore(high?.danceability, "danceable"),
        typeof lowLevel?.lowlevel?.average_loudness === "number"
          ? normalize(lowLevel.lowlevel.average_loudness, 0.2, 1)
          : null,
        typeof lowLevel?.rhythm?.onset_rate === "number"
          ? normalize(lowLevel.rhythm.onset_rate, 0.5, 4.5)
          : null,
        typeof lowLevel?.lowlevel?.dynamic_complexity === "number"
          ? normalize(lowLevel.lowlevel.dynamic_complexity, 0.5, 5)
          : null,
        typeof lowLevel?.rhythm?.bpm === "number"
          ? normalize(lowLevel.rhythm.bpm, 70, 170)
          : null,
      ],
      0.5
    )
  );

  return { energy, valence };
};

const escapeLucene = (value: string): string =>
  value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&").trim();

export const cleanYoutubeTitle = (title: string): string =>
  title
    .replace(/\s*\((?:official\s*)?(?:music\s*)?video\)/gi, "")
    .replace(/\s*\[(?:official\s*)?(?:music\s*)?video\]/gi, "")
    .replace(/\s*-\s*lyrics?$/gi, "")
    .trim();

export const parseTitleAndArtist = (
  rawTitle: string,
  channelArtist: string
): { title: string; artist: string } => {
  const cleaned = cleanYoutubeTitle(rawTitle);
  const splitMatch = cleaned.match(/^(.+?)\s*[-–|]\s*(.+)$/);
  if (splitMatch) {
    return {
      artist: splitMatch[1].trim(),
      title: splitMatch[2].trim(),
    };
  }
  return {
    artist: channelArtist,
    title: cleaned,
  };
};

let lastMusicBrainzRequestAt = 0;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const rateLimitedMusicBrainzFetch = async (url: string): Promise<Response> => {
  const elapsed = Date.now() - lastMusicBrainzRequestAt;
  if (elapsed < 1100) {
    await sleep(1100 - elapsed);
  }
  lastMusicBrainzRequestAt = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": MUSICBRAINZ_USER_AGENT,
      Accept: "application/json",
    },
  });
};

const searchMusicBrainzRecordings = async (
  artist: string,
  title: string
): Promise<string[]> => {
  const query = `recording:"${escapeLucene(title)}" AND artist:"${escapeLucene(artist)}"`;
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
  const response = await rateLimitedMusicBrainzFetch(url);
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as MusicBrainzRecordingSearch;
  return (payload.recordings ?? [])
    .sort((a, b) => b.score - a.score)
    .map((recording) => recording.id);
};

const fetchAcousticBrainzFeatures = async (
  recordingId: string
): Promise<DerivedAcousticFeatures | null> => {
  const [highResponse, lowResponse] = await Promise.all([
    fetch(`https://acousticbrainz.org/api/v1/${recordingId}/high-level`),
    fetch(`https://acousticbrainz.org/api/v1/${recordingId}/low-level`),
  ]);

  if (!highResponse.ok && !lowResponse.ok) {
    return null;
  }

  const highLevel = highResponse.ok
    ? ((await highResponse.json()) as AcousticBrainzHighLevel)
    : {};
  const lowLevel = lowResponse.ok
    ? ((await lowResponse.json()) as AcousticBrainzLowLevel)
    : undefined;

  if (!highLevel.highlevel && !lowLevel) {
    return null;
  }

  const derived = deriveEnergyAndValence(highLevel, lowLevel);
  return {
    ...derived,
    source: "acousticbrainz",
    recordingId,
  };
};

export const lookupAcousticFeatures = async (
  artist: string,
  title: string
): Promise<DerivedAcousticFeatures | null> => {
  const recordingIds = await searchMusicBrainzRecordings(artist, title);
  for (const recordingId of recordingIds) {
    const features = await fetchAcousticBrainzFeatures(recordingId);
    if (features) {
      return features;
    }
  }
  return null;
};
