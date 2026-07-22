import type { SharedLibrarySnapshot } from "../../shared/sharedLibrary";
import { mergeSharedLibrarySnapshots } from "../../shared/sharedLibrary";
import type { GraphPoint } from "./types";
import type { AxisMetric, Song } from "./types";
import { getMetricValue } from "./layoutMetrics";
import {
  getCanonicalSongId,
  getIsolateScopeOwnerIdFromSongId,
  hasMultipleLibraryOwners,
} from "./isolateScopeSongs";

export type LibraryScopeMode = "conglomerate" | "isolate";

type GraphDimensions = { width: number; height: number };

/** @deprecated Shared nodes are duplicated per owner in isolate mode. */
export const SHARED_OWNER_CLUSTER_ID = "__shared__";

export type OwnerMetaCluster = {
  id: string;
  name: string;
  center: GraphPoint;
  radius: number;
  shape: "circle" | "wedge";
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
};

export type OwnerMetaClusterOptions = {
  isAxisView?: boolean;
  ownerBounds?: Map<string, { centroid: GraphPoint; radius: number }>;
};

export const isMockContributorId = (contributorId: string): boolean => contributorId.startsWith("mock-user-");

export const getSongOwnerIds = (song: { owners?: Array<{ id: string }> }): string[] =>
  (song.owners ?? []).map((owner) => owner.id);

/** Pick one contributor wedge for display (shared tracks use first owner name, then id). */
export const resolveIsolateDisplayOwnerId = (
  song: { id: string; owners?: Array<{ id: string; name: string }> },
  enabledOwnerIds?: string[]
): string => {
  const isolateOwnerId = getIsolateScopeOwnerIdFromSongId(song.id);
  if (isolateOwnerId) {
    return isolateOwnerId;
  }

  const enabled = new Set(enabledOwnerIds ?? []);
  const owners = (song.owners ?? []).filter((owner) => enabled.size === 0 || enabled.has(owner.id));
  if (owners.length === 0) {
    return "unknown";
  }
  const sorted = [...owners].sort(
    (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  );
  return sorted[0].id;
};

export const getSongScopeClusterId = (song: { id: string; owners?: Array<{ id: string; name: string }> }): string =>
  resolveIsolateDisplayOwnerId(song);

const countSongsForOwner = (songs: Array<{ id: string; owners?: Array<{ id: string }> }>, ownerId: string): number =>
  songs.filter((song) => getSongScopeClusterId(song) === ownerId).length;

export const radiusForSongCount = (songCount: number, minDimension: number): number => {
  const base = minDimension * 0.085;
  const growth = minDimension * 0.013;
  return Math.min(minDimension * 0.24, base + Math.sqrt(Math.max(1, songCount)) * growth);
};

export const getEnabledOwnerMetaClusters = (
  songs: Array<{ id: string; owners?: Array<{ id: string; name: string }> }>,
  dimensions: GraphDimensions,
  enabledOwnerIds?: string[],
  options: OwnerMetaClusterOptions = {}
): OwnerMetaCluster[] => {
  const enabled = new Set(enabledOwnerIds ?? []);
  const ownersById = new Map<string, string>();

  songs.forEach((song) => {
    const ownerId = getSongScopeClusterId(song);
    const ownerName = song.owners?.find((owner) => owner.id === ownerId)?.name;
    if (ownerName && (enabled.size === 0 || enabled.has(ownerId))) {
      ownersById.set(ownerId, ownerName);
    }
  });

  const ownerIds = [...ownersById.keys()].sort((left, right) =>
    (ownersById.get(left) ?? left).localeCompare(ownersById.get(right) ?? right)
  );

  const usableWidth = dimensions.width - 96;
  const usableHeight = dimensions.height - 96;
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const minDimension = Math.min(usableWidth, usableHeight);

  if (options.isAxisView) {
    const innerRadius = minDimension * 0.05;
    const outerRadius = minDimension * 0.46;
    const wedgeGap = ownerIds.length > 1 ? 0.06 : 0;
    const wedgeSpan = (Math.PI * 2) / Math.max(1, ownerIds.length);

    return ownerIds.map((clusterId, ownerIndex) => {
      const startAngle = ownerIndex * wedgeSpan - Math.PI / 2 + wedgeGap / 2;
      const endAngle = startAngle + wedgeSpan - wedgeGap;
      return {
        id: clusterId,
        name: ownersById.get(clusterId) ?? clusterId,
        center: { x: centerX, y: centerY },
        radius: outerRadius,
        shape: "wedge",
        innerRadius,
        outerRadius,
        startAngle,
        endAngle,
      };
    });
  }

  const ownerBounds = options.ownerBounds;
  const defaultSoloRadius = minDimension * 0.38;
  const ownerRadii = ownerIds.map((ownerId) => ownerBounds?.get(ownerId)?.radius ?? defaultSoloRadius);
  const maxOwnerRadius = ownerRadii.length > 0 ? Math.max(...ownerRadii) : defaultSoloRadius;
  const ringCount = ownerIds.length;
  const separationPadding = 32;
  const sinHalfStep = Math.sin(Math.PI / Math.max(ringCount, 1));
  const minOrbitForSpacing =
    ringCount <= 1 ? 0 : (maxOwnerRadius * 2 + separationPadding) / Math.max(0.35, 2 * sinHalfStep);
  const orbitRadius = ringCount <= 1 ? 0 : Math.max(minDimension * 0.08, minOrbitForSpacing);

  return ownerIds.map((clusterId, ownerIndex) => {
    const radius = ownerRadii[ownerIndex] ?? maxOwnerRadius;
    const ringAngle = (ownerIndex / Math.max(1, ringCount)) * Math.PI * 2 - Math.PI / 2;

    return {
      id: clusterId,
      name: ownersById.get(clusterId) ?? clusterId,
      center:
        ringCount <= 1
          ? { x: centerX, y: centerY }
          : {
              x: centerX + orbitRadius * Math.cos(ringAngle),
              y: centerY + orbitRadius * Math.sin(ringAngle),
            },
      radius,
      shape: "circle",
    };
  });
};

export const transformToMetaCluster = (
  innerPoint: GraphPoint,
  innerDimensions: GraphDimensions,
  meta: OwnerMetaCluster,
  fitScale = 0.76
): GraphPoint => {
  const innerCenter = { x: innerDimensions.width / 2, y: innerDimensions.height / 2 };
  const offsetX = innerPoint.x - innerCenter.x;
  const offsetY = innerPoint.y - innerCenter.y;
  const innerRadius = Math.min(innerDimensions.width, innerDimensions.height) / 2;
  const scale = innerRadius > 0 ? (meta.radius / innerRadius) * fitScale : 0;
  return {
    x: meta.center.x + offsetX * scale,
    y: meta.center.y + offsetY * scale,
  };
};

export type IsolateAxisPlacement = {
  rank: number;
  count: number;
};

const buildIsolateAxisPlacementMap = (
  ownerSongs: Song[],
  metric: AxisMetric
): Map<string, IsolateAxisPlacement> => {
  const sorted = [...ownerSongs].sort((left, right) => {
    const leftValue = getMetricValue(left, metric) ?? 0;
    const rightValue = getMetricValue(right, metric) ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
    return left.title.localeCompare(right.title);
  });

  const placements = new Map<string, IsolateAxisPlacement>();
  sorted.forEach((song, index) => {
    placements.set(song.id, { rank: index, count: sorted.length });
  });
  return placements;
};

let cachedIsolateAxisPlacements: {
  key: string;
  placements: Map<string, IsolateAxisPlacement>;
} | null = null;

const getIsolateAxisPlacement = (
  song: Song,
  ownerSongs: Song[],
  metric: AxisMetric
): IsolateAxisPlacement => {
  const key = `${metric}:${ownerSongs.map((entry) => entry.id).join(",")}`;
  if (!cachedIsolateAxisPlacements || cachedIsolateAxisPlacements.key !== key) {
    cachedIsolateAxisPlacements = {
      key,
      placements: buildIsolateAxisPlacementMap(ownerSongs, metric),
    };
  }
  return cachedIsolateAxisPlacements.placements.get(song.id) ?? { rank: 0, count: Math.max(1, ownerSongs.length) };
};

const hashUnit = (seed: string, salt = ""): number => {
  let hash = 0;
  const value = `${seed}:${salt}`;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

export const wedgeIsolateAxisPosition = (
  song: Song,
  metricValue: number,
  metricMin: number,
  metricMax: number,
  meta: OwnerMetaCluster,
  ownerSongs: Song[],
  metric: AxisMetric
): GraphPoint => {
  const normalized =
    metricMax === metricMin ? 0.5 : (metricValue - metricMin) / Math.max(metricMax - metricMin, 1);
  const angleJitter = 0.08;
  const radiusJitter = 0.06;

  if (meta.shape === "circle" || meta.startAngle === undefined || meta.endAngle === undefined) {
    const innerRadius = meta.innerRadius ?? 0;
    const outerRadius = meta.outerRadius ?? meta.radius;
    const radiusSpan = Math.max(outerRadius - innerRadius, 1);
    const radius =
      innerRadius +
      normalized * radiusSpan * (0.88 + hashUnit(song.id, `${metric}-r`) * radiusJitter * 2);
    const angle = hashUnit(song.id, `${metric}-a`) * Math.PI * 2 - Math.PI / 2;
    return {
      x: meta.center.x + radius * Math.cos(angle),
      y: meta.center.y + radius * Math.sin(angle),
    };
  }

  const innerRadius = meta.innerRadius ?? meta.radius * 0.2;
  const outerRadius = meta.outerRadius ?? meta.radius;
  const radiusSpan = Math.max(outerRadius - innerRadius, 1);
  const radius =
    innerRadius +
    normalized * radiusSpan * (0.9 + hashUnit(song.id, `${metric}-r`) * radiusJitter * 2);
  const angleSpan = meta.endAngle - meta.startAngle;
  const inset = Math.min(angleSpan * angleJitter, 0.12);
  const angle =
    meta.startAngle +
    inset +
    hashUnit(song.id, `${metric}-a`) * Math.max(angleSpan - inset * 2, 0.05);

  return {
    x: meta.center.x + radius * Math.cos(angle),
    y: meta.center.y + radius * Math.sin(angle),
  };
};

export const wedgeToHullPath = (
  center: GraphPoint,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string => {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStartX = center.x + outerRadius * Math.cos(startAngle);
  const outerStartY = center.y + outerRadius * Math.sin(startAngle);
  const outerEndX = center.x + outerRadius * Math.cos(endAngle);
  const outerEndY = center.y + outerRadius * Math.sin(endAngle);
  const innerEndX = center.x + innerRadius * Math.cos(endAngle);
  const innerEndY = center.y + innerRadius * Math.sin(endAngle);
  const innerStartX = center.x + innerRadius * Math.cos(startAngle);
  const innerStartY = center.y + innerRadius * Math.sin(startAngle);

  return [
    `M ${innerStartX.toFixed(1)} ${innerStartY.toFixed(1)}`,
    `L ${outerStartX.toFixed(1)} ${outerStartY.toFixed(1)}`,
    `A ${outerRadius.toFixed(1)} ${outerRadius.toFixed(1)} 0 ${largeArc} 1 ${outerEndX.toFixed(1)} ${outerEndY.toFixed(1)}`,
    `L ${innerEndX.toFixed(1)} ${innerEndY.toFixed(1)}`,
    `A ${innerRadius.toFixed(1)} ${innerRadius.toFixed(1)} 0 ${largeArc} 0 ${innerStartX.toFixed(1)} ${innerStartY.toFixed(1)}`,
    "Z",
  ].join(" ");
};

export function songsForOwnerScope<T extends { id: string; owners?: Array<{ id: string }> }>(
  songs: T[],
  ownerClusterId: string
): T[] {
  return songs.filter((song) => getSongScopeClusterId(song) === ownerClusterId);
}

export { getCanonicalSongId, hasMultipleLibraryOwners } from "./isolateScopeSongs";

export const mergeSnapshotsWithMocks = (
  snapshots: SharedLibrarySnapshot[],
  mockSnapshots: SharedLibrarySnapshot[]
): ReturnType<typeof mergeSharedLibrarySnapshots> => mergeSharedLibrarySnapshots([...snapshots, ...mockSnapshots]);
