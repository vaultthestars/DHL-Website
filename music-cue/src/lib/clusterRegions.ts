import { ClusterCenterOverrides, ClusterMode, CustomClusterCatalog, GraphPoint, LayoutConfig, LibraryStats, NormalizedPoint, Song } from "./types";
import {
  getPlaylistOverlapClusterCenter,
  getPlaylistOverlapLabelCenter,
  getPlaylistOverlapLayoutContext,
  getUnassignedOverlapCenter,
} from "./playlistOverlapLayout";
import { clusterHue, hueToFill } from "./graphColors";
import {
  getDefaultGenreClusterCenter,
  GraphDimensions,
  resolveClusterCenter,
} from "./graphLayout";
import { getEnabledOwnerMetaClusters, getSongScopeClusterId, LibraryScopeMode, wedgeToHullPath } from "./libraryScope";
import { getClusterOverridesForOwner } from "./isolateClusterLayout";
import { isClusterView } from "./layoutMetrics";
import { buildLibraryStatsFromSongs } from "../../shared/sharedLibrary";
import {
  getCustomClusterHue,
  getCustomClusterMemberCount,
  getDefaultCustomClusterCenter,
  getUnassignedCustomClusterCenter,
  resolveSongCustomClusterId,
  UNASSIGNED_CUSTOM_CLUSTER_ID,
} from "./customClusters";

import { UNASSIGNED_PLAYLIST_CLUSTER_ID } from "./playlistConstants";

export const LARGE_LIBRARY_CLUSTER_HULL_THRESHOLD = 300;

export type ClusterViewportHint = {
  clusterId: string;
  center: GraphPoint;
  songIds: string[];
};

export type ClusterRegion = {
  id: string;
  label: string;
  center: GraphPoint;
  hullPath: string;
  fill: string;
  stroke: string;
  memberCount: number;
};

const cross = (origin: GraphPoint, a: GraphPoint, b: GraphPoint): number =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

const convexHull = (points: GraphPoint[]): GraphPoint[] => {
  if (points.length <= 1) {
    return points;
  }
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const lower: GraphPoint[] = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  });
  const upper: GraphPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
};

const expandHull = (hull: GraphPoint[], padding: number): GraphPoint[] => {
  if (hull.length === 0) {
    return hull;
  }
  const centroid = hull.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  centroid.x /= hull.length;
  centroid.y /= hull.length;
  return hull.map((point) => {
    const dx = point.x - centroid.x;
    const dy = point.y - centroid.y;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      x: point.x + (dx / distance) * padding,
      y: point.y + (dy / distance) * padding,
    };
  });
};

const pointsToHullPath = (points: GraphPoint[], padding: number): string => {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    const point = points[0];
    const radius = Math.max(padding, 18);
    return `M ${(point.x - radius).toFixed(1)} ${point.y.toFixed(1)} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  }
  if (points.length === 2) {
    const [first, second] = points;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = (-dy / length) * padding;
    const normalY = (dx / length) * padding;
    return [
      `M ${(first.x + normalX).toFixed(1)} ${(first.y + normalY).toFixed(1)}`,
      `L ${(second.x + normalX).toFixed(1)} ${(second.y + normalY).toFixed(1)}`,
      `L ${(second.x - normalX).toFixed(1)} ${(second.y - normalY).toFixed(1)}`,
      `L ${(first.x - normalX).toFixed(1)} ${(first.y - normalY).toFixed(1)}`,
      "Z",
    ].join(" ");
  }
  const hull = expandHull(convexHull(points), padding);
  return hull.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ") + " Z";
};

const truncateLabel = (label: string, maxLength = 28): string =>
  label.length <= maxLength ? label : `${label.slice(0, maxLength - 1)}…`;

const circleHullPath = (center: GraphPoint, radius: number): string =>
  `M ${(center.x - radius).toFixed(1)} ${center.y.toFixed(1)} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;

const estimateClusterHullRadius = (memberCount: number, padding: number): number =>
  Math.max(padding, Math.min(96, padding + Math.sqrt(memberCount) * 3));

const getGenreClusterCenter = (
  genre: string,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): GraphPoint =>
  resolveClusterCenter(
    getDefaultGenreClusterCenter(genre, stats, dimensions),
    clusterOverrides.genre[genre],
    dimensions
  );

const getPlaylistClusterCenter = (
  playlistId: string,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  visibleSongs: Song[]
): GraphPoint => {
  const context = getPlaylistOverlapLayoutContext(stats, visibleSongs, dimensions, clusterOverrides);
  if (playlistId === UNASSIGNED_PLAYLIST_CLUSTER_ID) {
    return getUnassignedOverlapCenter(context);
  }
  return (
    getPlaylistOverlapLabelCenter(playlistId, context) ??
    getPlaylistOverlapClusterCenter(playlistId, context) ?? {
      x: dimensions.width / 2,
      y: dimensions.height / 2,
    }
  );
};

const getCustomClusterCenter = (
  clusterId: string,
  clusterIndex: number,
  clusterCount: number,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides
): GraphPoint => {
  const defaultCenter =
    clusterId === UNASSIGNED_CUSTOM_CLUSTER_ID
      ? getUnassignedCustomClusterCenter(dimensions)
      : getDefaultCustomClusterCenter(clusterIndex, clusterCount, dimensions);
  return resolveClusterCenter(defaultCenter, (clusterOverrides.custom ?? {})[clusterId], dimensions);
};

const getClusterMembers = (
  clusterId: string,
  clusterMode: ClusterMode,
  visibleSongs: Song[],
  customCatalog?: CustomClusterCatalog
): Song[] => {
  if (clusterMode === "genre") {
    return visibleSongs.filter((song) => song.genre === clusterId);
  }
  if (clusterMode === "playlist") {
    if (clusterId === UNASSIGNED_PLAYLIST_CLUSTER_ID) {
      return visibleSongs.filter((song) => (song.playlists ?? []).length === 0);
    }
    return visibleSongs.filter((song) => (song.playlists ?? []).includes(clusterId));
  }
  if (clusterMode === "custom" && customCatalog) {
    if (clusterId === UNASSIGNED_CUSTOM_CLUSTER_ID) {
      const assigned = new Set(customCatalog.clusters.flatMap((cluster) => cluster.songIds));
      return visibleSongs.filter((song) => !assigned.has(song.id));
    }
    const cluster = customCatalog.clusters.find((entry) => entry.id === clusterId);
    if (!cluster) {
      return [];
    }
    const memberIds = new Set(cluster.songIds);
    return visibleSongs.filter((song) => memberIds.has(song.id));
  }
  return [];
};

type ClusterEntry = {
  id: string;
  label: string;
  hue: number;
  center: GraphPoint;
};

const buildClusterEntries = (
  clusterMode: ClusterMode,
  visibleSongs: Song[],
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  customCatalog?: CustomClusterCatalog
): ClusterEntry[] => {
  if (clusterMode === "genre") {
    return stats.genres.map((genre, index) => ({
      id: genre,
      label: genre,
      hue: clusterHue(index, stats.genres.length),
      center: getGenreClusterCenter(genre, stats, dimensions, clusterOverrides),
    }));
  }
  if (clusterMode === "playlist") {
    const entries: ClusterEntry[] = stats.playlistIds.map((playlistId, index) => ({
      id: playlistId,
      label: stats.playlistNames[playlistId] ?? playlistId,
      hue: clusterHue(index, stats.playlistIds.length),
      center: getPlaylistClusterCenter(playlistId, stats, dimensions, clusterOverrides, visibleSongs),
    }));
    if (visibleSongs.some((song) => (song.playlists ?? []).length === 0)) {
      entries.push({
        id: UNASSIGNED_PLAYLIST_CLUSTER_ID,
        label: "No playlist",
        hue: 0,
        center: getPlaylistClusterCenter(
          UNASSIGNED_PLAYLIST_CLUSTER_ID,
          stats,
          dimensions,
          clusterOverrides,
          visibleSongs
        ),
      });
    }
    return entries;
  }
  if (clusterMode === "custom") {
    const catalog = customCatalog ?? { clusters: [] };
    const labelClusters = catalog.clusters.filter((cluster) => cluster.kind !== "squiggly");
    return labelClusters.map((cluster, index) => ({
      id: cluster.id,
      label: cluster.label,
      hue: getCustomClusterHue(cluster.id, catalog),
      center: getCustomClusterCenter(
        cluster.id,
        index,
        Math.max(1, labelClusters.length),
        dimensions,
        clusterOverrides
      ),
    }));
  }
  return [];
};

export const buildClusterViewportHints = (
  clusterMode: ClusterMode,
  visibleSongs: Song[],
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  customCatalog?: CustomClusterCatalog
): ClusterViewportHint[] =>
  buildClusterEntries(clusterMode, visibleSongs, stats, dimensions, clusterOverrides, customCatalog)
    .map((cluster) => {
      const members = getClusterMembers(cluster.id, clusterMode, visibleSongs, customCatalog);
      if (members.length === 0) {
        return null;
      }
      return {
        clusterId: cluster.id,
        center: cluster.center,
        songIds: members.map((song) => song.id),
      };
    })
    .filter((hint): hint is ClusterViewportHint => hint !== null);

export const buildClusterRegions = (
  clusterMode: ClusterMode,
  visibleSongs: Song[],
  getPosition: (song: Song) => GraphPoint,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  customCatalog?: CustomClusterCatalog
): ClusterRegion[] => {
  if (clusterMode !== "genre" && clusterMode !== "playlist" && clusterMode !== "custom") {
    return [];
  }

  const useLiteHulls = visibleSongs.length >= LARGE_LIBRARY_CLUSTER_HULL_THRESHOLD;
  const clusterEntries = buildClusterEntries(
    clusterMode,
    visibleSongs,
    stats,
    dimensions,
    clusterOverrides,
    customCatalog
  );

  return clusterEntries
    .map((cluster) => {
      const members = getClusterMembers(cluster.id, clusterMode, visibleSongs, customCatalog);
      if (members.length === 0) {
        return null;
      }
      const padding = Math.max(20, Math.min(42, 14 + Math.sqrt(members.length) * 3));
      let hullPath: string;
      let labelCenter: GraphPoint;
      if (useLiteHulls) {
        const radius = estimateClusterHullRadius(members.length, padding);
        hullPath = circleHullPath(cluster.center, radius);
        labelCenter = cluster.center;
      } else {
        const memberPositions = members.map((song) => getPosition(song));
        hullPath = pointsToHullPath(memberPositions, padding);
        labelCenter =
          memberPositions.length > 0
            ? memberPositions.reduce(
                (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
                { x: 0, y: 0 }
              )
            : cluster.center;
        if (memberPositions.length > 0) {
          labelCenter.x /= memberPositions.length;
          labelCenter.y /= memberPositions.length;
        }
      }
      return {
        id: cluster.id,
        label: truncateLabel(cluster.label),
        center: labelCenter,
        hullPath,
        fill: hueToFill(cluster.hue, 62, 72, 0.16),
        stroke: hueToFill(cluster.hue, 72, 42, 0.55),
        memberCount: members.length,
      };
    })
    .filter((region): region is ClusterRegion => region !== null);
};

const ownerScopedClusterId = (ownerId: string, clusterId: string): string => `owner:${ownerId}:${clusterId}`;

export const buildIsolateScopedClusterViewportHints = (
  graphSongs: Song[],
  clusterMode: ClusterMode,
  layoutConfig: LayoutConfig,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  enabledOwnerIds?: string[],
  playlistNames: Record<string, string> = {},
  ownerBounds?: Map<string, { centroid: GraphPoint; radius: number }>,
  customCatalogForOwner?: (ownerId: string) => CustomClusterCatalog
): ClusterViewportHint[] => {
  const metaClusters = getEnabledOwnerMetaClusters(graphSongs, dimensions, enabledOwnerIds, {
    isAxisView: false,
    ownerBounds,
  });

  return metaClusters.flatMap((meta) => {
    const ownerSongs = graphSongs.filter((song) => getSongScopeClusterId(song) === meta.id);
    if (ownerSongs.length === 0) {
      return [];
    }

    const ownerStats = buildLibraryStatsFromSongs(ownerSongs, playlistNames);
    const ownerOverrides = getClusterOverridesForOwner(clusterOverrides, meta.id, layoutConfig);
    const ownerCatalog = customCatalogForOwner?.(meta.id);
    return buildClusterViewportHints(
      clusterMode,
      ownerSongs,
      ownerStats,
      dimensions,
      ownerOverrides,
      ownerCatalog
    ).map((hint) => ({
      ...hint,
      clusterId: ownerScopedClusterId(meta.id, hint.clusterId),
    }));
  });
};

export const buildIsolateScopedClusterRegions = (
  graphSongs: Song[],
  clusterMode: ClusterMode,
  layoutConfig: LayoutConfig,
  getPosition: (song: Song) => GraphPoint,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  enabledOwnerIds?: string[],
  playlistNames: Record<string, string> = {},
  ownerBounds?: Map<string, { centroid: GraphPoint; radius: number }>,
  customCatalogForOwner?: (ownerId: string) => CustomClusterCatalog
): ClusterRegion[] => {
  const metaClusters = getEnabledOwnerMetaClusters(graphSongs, dimensions, enabledOwnerIds, {
    isAxisView: false,
    ownerBounds,
  });

  return metaClusters.flatMap((meta) => {
    const ownerSongs = graphSongs.filter((song) => getSongScopeClusterId(song) === meta.id);
    if (ownerSongs.length === 0) {
      return [];
    }

    const ownerStats = buildLibraryStatsFromSongs(ownerSongs, playlistNames);
    const ownerOverrides = getClusterOverridesForOwner(clusterOverrides, meta.id, layoutConfig);
    const ownerCatalog = customCatalogForOwner?.(meta.id);
    return buildClusterRegions(
      clusterMode,
      ownerSongs,
      getPosition,
      ownerStats,
      dimensions,
      ownerOverrides,
      ownerCatalog
    ).map((region) => ({
      ...region,
      id: ownerScopedClusterId(meta.id, region.id),
    }));
  });
};

export const buildOwnerMetaRegions = (
  visibleSongs: Song[],
  dimensions: GraphDimensions,
  libraryScopeMode: LibraryScopeMode,
  enabledOwnerIds: string[] | undefined,
  getPosition: (song: Song) => GraphPoint,
  layoutConfig: LayoutConfig,
  ownerBounds?: Map<string, { centroid: GraphPoint; radius: number }>
): ClusterRegion[] => {
  if (libraryScopeMode !== "isolate") {
    return [];
  }

  const isClusterLayout = isClusterView(layoutConfig);

  return getEnabledOwnerMetaClusters(visibleSongs, dimensions, enabledOwnerIds, {
    isAxisView: !isClusterLayout,
    ownerBounds,
  }).map((meta, index) => {
    const members = visibleSongs.filter((song) => getSongScopeClusterId(song) === meta.id);
    const hue = clusterHue(index, 6);

    let hullPath: string;
    let labelCenter: GraphPoint;

    if (!isClusterLayout && meta.shape === "wedge" && meta.startAngle !== undefined && meta.endAngle !== undefined) {
      const innerRadius = meta.innerRadius ?? meta.radius * 0.2;
      const outerRadius = meta.outerRadius ?? meta.radius;
      hullPath = wedgeToHullPath(meta.center, innerRadius, outerRadius, meta.startAngle, meta.endAngle);
      const midAngle = (meta.startAngle + meta.endAngle) / 2;
      const labelRadius = innerRadius + (outerRadius - innerRadius) * 0.55;
      labelCenter = {
        x: meta.center.x + labelRadius * Math.cos(midAngle),
        y: meta.center.y + labelRadius * Math.sin(midAngle),
      };
    } else if (isClusterLayout && members.length > 0) {
      if (visibleSongs.length >= LARGE_LIBRARY_CLUSTER_HULL_THRESHOLD) {
        const radius = meta.radius + Math.max(24, Math.sqrt(members.length) * 4);
        hullPath = circleHullPath(meta.center, radius);
        labelCenter = meta.center;
      } else {
        const memberPositions = members.map((song) => getPosition(song));
        const padding = Math.max(24, Math.min(52, 18 + Math.sqrt(members.length) * 4)) * 5;
        hullPath = pointsToHullPath(memberPositions, padding);
        labelCenter =
          memberPositions.length > 0
            ? memberPositions.reduce(
                (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
                { x: 0, y: 0 }
              )
            : meta.center;
        if (memberPositions.length > 0) {
          labelCenter = {
            x: labelCenter.x / memberPositions.length,
            y: labelCenter.y / memberPositions.length,
          };
        }
      }
    } else {
      const radius = meta.radius + 18;
      hullPath = `M ${(meta.center.x - radius).toFixed(1)} ${meta.center.y.toFixed(1)} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
      labelCenter = meta.center;
    }

    return {
      id: `owner:${meta.id}`,
      label: meta.name,
      center: labelCenter,
      hullPath,
      fill: hueToFill(hue, 62, 72, 0.08),
      stroke: hueToFill(hue, 72, 42, 0.45),
      memberCount: members.length,
    };
  });
};

export const findNearestCluster = (
  point: GraphPoint,
  clusterMode: ClusterMode,
  stats: LibraryStats,
  dimensions: GraphDimensions,
  clusterOverrides: ClusterCenterOverrides,
  maxDistance = 80,
  customCatalog?: CustomClusterCatalog
): string | null => {
  if (clusterMode !== "genre" && clusterMode !== "playlist" && clusterMode !== "custom") {
    return null;
  }

  const clusters =
    clusterMode === "genre"
      ? stats.genres.map((genre) => ({
          id: genre,
          center: getGenreClusterCenter(genre, stats, dimensions, clusterOverrides),
        }))
      : clusterMode === "playlist"
        ? stats.playlistIds.map((playlistId) => ({
            id: playlistId,
            center: getPlaylistClusterCenter(playlistId, stats, dimensions, clusterOverrides, []),
          }))
        : (customCatalog?.clusters ?? []).map((cluster, index) => ({
            id: cluster.id,
            center: getCustomClusterCenter(
              cluster.id,
              index,
              customCatalog.clusters.length,
              dimensions,
              clusterOverrides
            ),
          }));

  let nearestId: string | null = null;
  let nearestDistance = maxDistance;
  clusters.forEach((cluster) => {
    const distance = Math.hypot(point.x - cluster.center.x, point.y - cluster.center.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = cluster.id;
    }
  });
  return nearestId;
};

export { UNASSIGNED_PLAYLIST_CLUSTER_ID } from "./playlistConstants";
