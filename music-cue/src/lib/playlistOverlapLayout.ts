import { asStringArray, getSongPlaylists } from "./arrayUtils";
import { ClusterCenterOverrides, GraphPoint, LibraryStats, Song } from "./types";
import { UNASSIGNED_PLAYLIST_CLUSTER_ID } from "./playlistConstants";
import { GraphDimensions, resolveClusterCenter } from "./graphLayout";

const GRAPH_PADDING = 48;
const OVERLAP_THRESHOLD = 0.28;

const hashUnit = (seed: string, salt = ""): number => {
  let hash = 0;
  for (let index = 0; index < `${seed}:${salt}`.length; index += 1) {
    hash = (hash << 5) - hash + `${seed}:${salt}`.charCodeAt(index);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

const scatterAroundCenter = (song: Song, center: GraphPoint, spread: number): GraphPoint => {
  const angle = hashUnit(song.id, "angle") * Math.PI * 2;
  const radius = Math.sqrt(hashUnit(song.id, "radius")) * spread;
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
};

type OverlapGroup = {
  id: string;
  playlistIds: string[];
  defaultCenter: GraphPoint;
};

export type PlaylistOverlapLayoutContext = {
  groups: OverlapGroup[];
  playlistCenters: Map<string, GraphPoint>;
  playlistToGroupId: Map<string, string>;
  unassignedCenter: GraphPoint;
  dimensions: GraphDimensions;
};

let cachedLayoutKey = "";
let cachedLayoutContext: PlaylistOverlapLayoutContext | null = null;

const buildPlaylistSongSets = (playlistIds: string[], songs: Song[]): Map<string, Set<string>> => {
  const sets = new Map<string, Set<string>>();
  playlistIds.forEach((playlistId) => sets.set(playlistId, new Set()));
  songs.forEach((song) => {
    getSongPlaylists(song).forEach((playlistId) => {
      sets.get(playlistId)?.add(song.id);
    });
  });
  return sets;
};

const jaccardSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let intersection = 0;
  left.forEach((songId) => {
    if (right.has(songId)) {
      intersection += 1;
    }
  });
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};

const clusterPlaylistsByOverlap = (playlistIds: string[], songSets: Map<string, Set<string>>): string[][] => {
  const parent = new Map<string, string>();
  playlistIds.forEach((playlistId) => parent.set(playlistId, playlistId));

  const find = (playlistId: string): string => {
    const root = parent.get(playlistId) ?? playlistId;
    if (root !== playlistId) {
      const resolved = find(root);
      parent.set(playlistId, resolved);
      return resolved;
    }
    return playlistId;
  };

  const union = (leftId: string, rightId: string) => {
    const leftRoot = find(leftId);
    const rightRoot = find(rightId);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };

  for (let leftIndex = 0; leftIndex < playlistIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < playlistIds.length; rightIndex += 1) {
      const leftId = playlistIds[leftIndex];
      const rightId = playlistIds[rightIndex];
      const leftSet = songSets.get(leftId) ?? new Set();
      const rightSet = songSets.get(rightId) ?? new Set();
      if (jaccardSimilarity(leftSet, rightSet) >= OVERLAP_THRESHOLD) {
        union(leftId, rightId);
      }
    }
  }

  const grouped = new Map<string, string[]>();
  playlistIds.forEach((playlistId) => {
    const root = find(playlistId);
    const members = grouped.get(root) ?? [];
    members.push(playlistId);
    grouped.set(root, members);
  });

  return [...grouped.values()].map((members) =>
    members.sort((left, right) => left.localeCompare(right))
  );
};

const getDefaultGroupCenter = (
  groupIndex: number,
  groupCount: number,
  dimensions: GraphDimensions,
  groupId: string
): GraphPoint => {
  const usableWidth = dimensions.width - GRAPH_PADDING * 2;
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  const centerX = GRAPH_PADDING + usableWidth / 2;
  const centerY = GRAPH_PADDING + usableHeight / 2;
  const orbitRadius = Math.min(usableWidth, usableHeight) * 0.48;
  const angle = (groupIndex / Math.max(1, groupCount)) * Math.PI * 2 - Math.PI / 2;
  const wobble = (hashUnit(groupId, "wobble") - 0.5) * 4;
  return {
    x: centerX + orbitRadius * Math.cos(angle) + wobble,
    y: centerY + orbitRadius * Math.sin(angle) + (hashUnit(`${groupId}-y`, "wobble") - 0.5) * 4,
  };
};

export const getDefaultUnassignedPlaylistCenter = (dimensions: GraphDimensions): GraphPoint => {
  const usableHeight = dimensions.height - GRAPH_PADDING * 2;
  return {
    x: GRAPH_PADDING - 12,
    y: GRAPH_PADDING + usableHeight / 2,
  };
};

const averagePoints = (points: GraphPoint[]): GraphPoint => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

const buildLayoutKey = (
  stats: LibraryStats,
  songs: Song[],
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): string =>
  JSON.stringify({
    playlistIds: asStringArray(stats.playlistIds),
    songCount: songs.length,
    dimensions,
    overrides: clusterOverrides.playlist,
  });

export const getPlaylistOverlapLayoutContext = (
  stats: LibraryStats,
  songs: Song[],
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): PlaylistOverlapLayoutContext => {
  const layoutKey = buildLayoutKey(stats, songs, dimensions, clusterOverrides);
  if (cachedLayoutKey === layoutKey && cachedLayoutContext) {
    return cachedLayoutContext;
  }

  const playlistIds = asStringArray(stats.playlistIds);
  const songSets = buildPlaylistSongSets(playlistIds, songs);
  const groupedPlaylistIds = clusterPlaylistsByOverlap(playlistIds, songSets);
  const playlistCenters = new Map<string, GraphPoint>();
  const groups: OverlapGroup[] = groupedPlaylistIds.map((members) => ({
    id: members.join("|"),
    playlistIds: members,
    defaultCenter: { x: 0, y: 0 },
  }));

  groups.forEach((group, index) => {
    group.defaultCenter = getDefaultGroupCenter(index, groups.length, dimensions, group.id);
    group.playlistIds.forEach((playlistId) => {
      playlistCenters.set(
        playlistId,
        resolveClusterCenter(group.defaultCenter, clusterOverrides.playlist[playlistId], dimensions)
      );
    });
  });

  const unassignedCenter = resolveClusterCenter(
    getDefaultUnassignedPlaylistCenter(dimensions),
    clusterOverrides.playlist[UNASSIGNED_PLAYLIST_CLUSTER_ID],
    dimensions
  );

  const playlistToGroupId = new Map<string, string>();
  groups.forEach((group) => {
    group.playlistIds.forEach((playlistId) => playlistToGroupId.set(playlistId, group.id));
  });

  cachedLayoutKey = layoutKey;
  cachedLayoutContext = {
    groups,
    playlistCenters,
    playlistToGroupId,
    unassignedCenter,
    dimensions,
  };
  return cachedLayoutContext;
};

const coreSpread = (memberCount: number, dimensions: GraphDimensions): number => {
  const span = Math.min(dimensions.width, dimensions.height);
  return Math.min(span * 0.055, 10 + Math.sqrt(memberCount) * 2.2);
};

const positionSongInGroup = (
  song: Song,
  group: OverlapGroup,
  context: PlaylistOverlapLayoutContext
): GraphPoint => {
  const memberships = group.playlistIds.filter((playlistId) => getSongPlaylists(song).includes(playlistId));
  const groupSize = group.playlistIds.length;
  const membershipCount = memberships.length;

  if (membershipCount === 0) {
    return group.defaultCenter;
  }

  const membershipCenters = memberships
    .map((playlistId) => context.playlistCenters.get(playlistId))
    .filter((center): center is GraphPoint => Boolean(center));
  const centroid = averagePoints(membershipCenters);

  if (membershipCount === groupSize) {
    return scatterAroundCenter(song, centroid, coreSpread(membershipCount, context.dimensions));
  }

  const membershipKey = memberships.slice().sort().join("|");
  const armAngle = hashUnit(membershipKey, "arm") * Math.PI * 2;
  const exclusivity = (groupSize - membershipCount) / Math.max(1, groupSize - 1);
  const span = Math.min(context.dimensions.width, context.dimensions.height);
  const armLength = span * (0.08 + exclusivity * 0.2);
  const alongJitter = (hashUnit(song.id, "along") - 0.5) * armLength * 0.35;
  const perpendicular = (hashUnit(song.id, "perp") - 0.5) * armLength * 0.42;
  const distance = armLength + alongJitter;

  return {
    x: centroid.x + Math.cos(armAngle) * distance - Math.sin(armAngle) * perpendicular,
    y: centroid.y + Math.sin(armAngle) * distance + Math.cos(armAngle) * perpendicular,
  };
};

export const layoutPlaylistOverlapSong = (
  song: Song,
  context: PlaylistOverlapLayoutContext
): GraphPoint => {
  const playlists = getSongPlaylists(song);
  if (playlists.length === 0) {
    return scatterAroundCenter(song, context.unassignedCenter, coreSpread(1, context.dimensions) * 0.85);
  }

  const relevantGroups = context.groups.filter((group) =>
    group.playlistIds.some((playlistId) => playlists.includes(playlistId))
  );

  if (relevantGroups.length === 0) {
    return scatterAroundCenter(song, context.unassignedCenter, coreSpread(1, context.dimensions) * 0.85);
  }

  const positions = relevantGroups.map((group) => positionSongInGroup(song, group, context));
  return averagePoints(positions);
};

export const getPlaylistOverlapLabelCenter = (
  playlistId: string,
  context: PlaylistOverlapLayoutContext
): GraphPoint | null => {
  const center = context.playlistCenters.get(playlistId);
  if (!center) {
    return null;
  }

  const groupId = context.playlistToGroupId.get(playlistId);
  const group = context.groups.find((entry) => entry.id === groupId);
  if (!group || group.playlistIds.length === 1) {
    return center;
  }

  const stackedAtSamePoint = group.playlistIds.every((otherId) => {
    const otherCenter = context.playlistCenters.get(otherId);
    return otherCenter && Math.hypot(otherCenter.x - center.x, otherCenter.y - center.y) < 6;
  });

  if (!stackedAtSamePoint) {
    return center;
  }

  const index = group.playlistIds.indexOf(playlistId);
  const angle = (index / group.playlistIds.length) * Math.PI * 2 - Math.PI / 2;
  const radius = 20 + group.playlistIds.length * 2;
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
};

export const getPlaylistOverlapClusterCenter = (
  playlistId: string,
  context: PlaylistOverlapLayoutContext
): GraphPoint | null => context.playlistCenters.get(playlistId) ?? null;

export const getUnassignedOverlapCenter = (context: PlaylistOverlapLayoutContext): GraphPoint =>
  context.unassignedCenter;

export const invalidatePlaylistOverlapLayoutCache = (): void => {
  cachedLayoutKey = "";
  cachedLayoutContext = null;
};
