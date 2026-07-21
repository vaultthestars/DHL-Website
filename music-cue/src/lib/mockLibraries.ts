import { buildLibraryStatsFromSongs } from "../../shared/sharedLibrary";
import type { LibraryContributor, SharedLibrarySnapshot } from "../../shared/sharedLibrary";
import type { Song } from "./types";

type MockTrackSeed = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  playCount: number;
  playlistId: string;
  playlistName: string;
};

const makeSong = (seed: MockTrackSeed): Song => ({
  id: seed.id,
  title: seed.title,
  artist: seed.artist,
  album: seed.album,
  genre: seed.genre,
  year: seed.year,
  playCount: seed.playCount,
  rating: 0,
  loved: true,
  dateAdded: "2024-01-01",
  trackType: "File",
  durationMs: 210000,
  playlists: [seed.playlistId],
});

const buildSnapshot = (id: string, name: string, seeds: MockTrackSeed[]): SharedLibrarySnapshot => {
  const songs = seeds.map(makeSong);
  const playlistNames = Object.fromEntries(seeds.map((seed) => [seed.playlistId, seed.playlistName]));
  return {
    contributor: { id, name },
    updatedAt: "2026-01-01T00:00:00.000Z",
    songs,
    stats: buildLibraryStatsFromSongs(songs, playlistNames),
  };
};

const SHARED: MockTrackSeed[] = [
  {
    id: "3n3Ppam7vgaVa1iaRUc9Lp",
    title: "Mr. Brightside",
    artist: "The Killers",
    album: "Hot Fuss",
    genre: "Indie Rock",
    year: 2004,
    playCount: 84,
    playlistId: "AUGUST_FAVES",
    playlistName: "August favorites",
  },
  {
    id: "6qqqefjEVVxW0n2Y5sLBI0",
    title: "Redbone",
    artist: "Childish Gambino",
    album: "Awaken, My Love!",
    genre: "R&B",
    year: 2016,
    playCount: 79,
    playlistId: "AUGUST_FAVES",
    playlistName: "August favorites",
  },
  {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    genre: "Synthpop",
    year: 2019,
    playCount: 88,
    playlistId: "SHARED_NIGHT",
    playlistName: "Late night drive",
  },
  {
    id: "2takcwOaAZWiXQijPHIA7d",
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    genre: "Electronic",
    year: 2011,
    playCount: 77,
    playlistId: "SHARED_NIGHT",
    playlistName: "Late night drive",
  },
  {
    id: "2x0Ih18JDJpOO5S5Vsd67Q",
    title: "Pink + White",
    artist: "Frank Ocean",
    album: "Blonde",
    genre: "Art Pop",
    year: 2016,
    playCount: 81,
    playlistId: "SHARED_FEELS",
    playlistName: "Shared feels",
  },
  {
    id: "4VqPOruhp5EdPBeR92za8a",
    title: "SICKO MODE",
    artist: "Travis Scott",
    album: "ASTROWORLD",
    genre: "Hip-Hop",
    year: 2018,
    playCount: 83,
    playlistId: "SHARED_PARTY",
    playlistName: "House party",
  },
];

const AUGUST_ONLY: MockTrackSeed[] = [
  {
    id: "1mea3bSkSGXuIRvNOcYHah",
    title: "Vienna",
    artist: "Billy Joel",
    album: "The Stranger",
    genre: "Soft Rock",
    year: 1977,
    playCount: 72,
    playlistId: "AUGUST_FAVES",
    playlistName: "August favorites",
  },
  {
    id: "7qiZfU4dY1lWllzX7PKE3w",
    title: "As It Was",
    artist: "Harry Styles",
    album: "Harry's House",
    genre: "Pop",
    year: 2022,
    playCount: 76,
    playlistId: "AUGUST_CHILL",
    playlistName: "August chill",
  },
  {
    id: "0eGsy0Tp889uUth0wo8rBA",
    title: "Dreams",
    artist: "Fleetwood Mac",
    album: "Rumours",
    genre: "Classic Rock",
    year: 1977,
    playCount: 74,
    playlistId: "AUGUST_CHILL",
    playlistName: "August chill",
  },
  {
    id: "5Z01UMMf7V1JN0HZ5BicNi",
    title: "Ivy",
    artist: "Frank Ocean",
    album: "Blonde",
    genre: "Art Pop",
    year: 2016,
    playCount: 70,
    playlistId: "SHARED_FEELS",
    playlistName: "Shared feels",
  },
  {
    id: "1C7QSS4WMj7AI2KTojK2M1",
    title: "Yellow",
    artist: "Coldplay",
    album: "Parachutes",
    genre: "Alternative",
    year: 2000,
    playCount: 68,
    playlistId: "AUGUST_INDIE",
    playlistName: "August indie",
  },
  {
    id: "6habFhsOp2NvshLv26Q1KB",
    title: "Get Lucky",
    artist: "Daft Punk",
    album: "Random Access Memories",
    genre: "Disco",
    year: 2013,
    playCount: 80,
    playlistId: "AUGUST_DANCE",
    playlistName: "August dance",
  },
  {
    id: "3AJwUDP919kvR9Q5cYJPt0",
    title: "Bags",
    artist: "Clairo",
    album: "Immunity",
    genre: "Bedroom Pop",
    year: 2019,
    playCount: 65,
    playlistId: "AUGUST_INDIE",
    playlistName: "August indie",
  },
  {
    id: "2LBqCSwhJGcFQeTHMVGwy3",
    title: "Die For You",
    artist: "The Weeknd",
    album: "Starboy",
    genre: "R&B",
    year: 2016,
    playCount: 71,
    playlistId: "AUGUST_CHILL",
    playlistName: "August chill",
  },
];

const RILEY_ONLY: MockTrackSeed[] = [
  {
    id: "2takcwOaAZWiXQijPHIA7d",
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    genre: "Electronic",
    year: 2011,
    playCount: 77,
    playlistId: "RILEY_GYM",
    playlistName: "Riley gym",
  },
  {
    id: "5Z01UMMf7V1JN0HZ5BicNi",
    title: "Ivy",
    artist: "Frank Ocean",
    album: "Blonde",
    genre: "Art Pop",
    year: 2016,
    playCount: 70,
    playlistId: "RILEY_FEELS",
    playlistName: "Riley feels",
  },
  {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    genre: "Synthpop",
    year: 2019,
    playCount: 88,
    playlistId: "RILEY_GYM",
    playlistName: "Riley gym",
  },
  {
    id: "4VqPOruhp5EdPBeR92za8a",
    title: "SICKO MODE",
    artist: "Travis Scott",
    album: "ASTROWORLD",
    genre: "Hip-Hop",
    year: 2018,
    playCount: 83,
    playlistId: "RILEY_GYM",
    playlistName: "Riley gym",
  },
  {
    id: "2x0Ih18JDJpOO5S5Vsd67Q",
    title: "Pink + White",
    artist: "Frank Ocean",
    album: "Blonde",
    genre: "Art Pop",
    year: 2016,
    playCount: 81,
    playlistId: "RILEY_FEELS",
    playlistName: "Riley feels",
  },
  {
    id: "3n3Ppam7vgaVa1iaRUc9Lp",
    title: "Mr. Brightside",
    artist: "The Killers",
    album: "Hot Fuss",
    genre: "Indie Rock",
    year: 2004,
    playCount: 84,
    playlistId: "RILEY_PARTY",
    playlistName: "Riley party",
  },
  {
    id: "6habFhsOp2NvshLv26Q1KB",
    title: "Get Lucky",
    artist: "Daft Punk",
    album: "Random Access Memories",
    genre: "Disco",
    year: 2013,
    playCount: 80,
    playlistId: "RILEY_PARTY",
    playlistName: "Riley party",
  },
  {
    id: "1C7QSS4WMj7AI2KTojK2M1",
    title: "Yellow",
    artist: "Coldplay",
    album: "Parachutes",
    genre: "Alternative",
    year: 2000,
    playCount: 68,
    playlistId: "RILEY_FEELS",
    playlistName: "Riley feels",
  },
  {
    id: "7qiZfU4dY1lWllzX7PKE3w",
    title: "As It Was",
    artist: "Harry Styles",
    album: "Harry's House",
    genre: "Pop",
    year: 2022,
    playCount: 76,
    playlistId: "RILEY_PARTY",
    playlistName: "Riley party",
  },
];

const SAM_ONLY: MockTrackSeed[] = [
  {
    id: "0eGsy0Tp889uUth0wo8rBA",
    title: "Dreams",
    artist: "Fleetwood Mac",
    album: "Rumours",
    genre: "Classic Rock",
    year: 1977,
    playCount: 74,
    playlistId: "SAM_ROAD",
    playlistName: "Sam roadtrip",
  },
  {
    id: "1C7QSS4WMj7AI2KTojK2M1",
    title: "Yellow",
    artist: "Coldplay",
    album: "Parachutes",
    genre: "Alternative",
    year: 2000,
    playCount: 68,
    playlistId: "SAM_ROAD",
    playlistName: "Sam roadtrip",
  },
  {
    id: "6habFhsOp2NvshLv26Q1KB",
    title: "Get Lucky",
    artist: "Daft Punk",
    album: "Random Access Memories",
    genre: "Disco",
    year: 2013,
    playCount: 80,
    playlistId: "SAM_DANCE",
    playlistName: "Sam dance",
  },
  {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    genre: "Synthpop",
    year: 2019,
    playCount: 88,
    playlistId: "SAM_DANCE",
    playlistName: "Sam dance",
  },
  {
    id: "2takcwOaAZWiXQijPHIA7d",
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    genre: "Electronic",
    year: 2011,
    playCount: 77,
    playlistId: "SAM_DANCE",
    playlistName: "Sam dance",
  },
  {
    id: "4VqPOruhp5EdPBeR92za8a",
    title: "SICKO MODE",
    artist: "Travis Scott",
    album: "ASTROWORLD",
    genre: "Hip-Hop",
    year: 2018,
    playCount: 83,
    playlistId: "SAM_PARTY",
    playlistName: "Sam party",
  },
  {
    id: "1mea3bSkSGXuIRvNOcYHah",
    title: "Vienna",
    artist: "Billy Joel",
    album: "The Stranger",
    genre: "Soft Rock",
    year: 1977,
    playCount: 72,
    playlistId: "SAM_ROAD",
    playlistName: "Sam roadtrip",
  },
  {
    id: "3AJwUDP919kvR9Q5cYJPt0",
    title: "Bags",
    artist: "Clairo",
    album: "Immunity",
    genre: "Bedroom Pop",
    year: 2019,
    playCount: 65,
    playlistId: "SAM_CHILL",
    playlistName: "Sam chill",
  },
  {
    id: "2LBqCSwhJGcFQeTHMVGwy3",
    title: "Die For You",
    artist: "The Weeknd",
    album: "Starboy",
    genre: "R&B",
    year: 2016,
    playCount: 71,
    playlistId: "SAM_CHILL",
    playlistName: "Sam chill",
  },
];

const dedupeSeeds = (seeds: MockTrackSeed[]): MockTrackSeed[] => {
  const seen = new Set<string>();
  return seeds.filter((seed) => {
    if (seen.has(seed.id)) {
      return false;
    }
    seen.add(seed.id);
    return true;
  });
};

export const MOCK_CONTRIBUTOR_IDS = {
  august: "mock-user-august",
  riley: "mock-user-riley",
  sam: "mock-user-sam",
} as const;

const MOCK_SNAPSHOTS: Record<string, SharedLibrarySnapshot> = {
  [MOCK_CONTRIBUTOR_IDS.august]: buildSnapshot(MOCK_CONTRIBUTOR_IDS.august, "August", dedupeSeeds([
    ...SHARED,
    ...AUGUST_ONLY,
  ])),
  [MOCK_CONTRIBUTOR_IDS.riley]: buildSnapshot(MOCK_CONTRIBUTOR_IDS.riley, "Riley", dedupeSeeds([
    ...SHARED,
    ...RILEY_ONLY,
  ])),
  [MOCK_CONTRIBUTOR_IDS.sam]: buildSnapshot(MOCK_CONTRIBUTOR_IDS.sam, "Sam", dedupeSeeds([
    ...SHARED,
    ...SAM_ONLY,
  ])),
};

export const getMockContributors = (): LibraryContributor[] =>
  Object.values(MOCK_SNAPSHOTS).map((snapshot) => ({
    id: snapshot.contributor.id,
    name: snapshot.contributor.name,
    updatedAt: snapshot.updatedAt,
    trackCount: snapshot.songs.length,
  }));

export const getMockSnapshot = (contributorId: string): SharedLibrarySnapshot | null =>
  MOCK_SNAPSHOTS[contributorId] ?? null;

export const getMockSnapshots = (contributorIds: string[]): SharedLibrarySnapshot[] =>
  contributorIds
    .map((contributorId) => getMockSnapshot(contributorId))
    .filter((snapshot): snapshot is SharedLibrarySnapshot => snapshot !== null);
