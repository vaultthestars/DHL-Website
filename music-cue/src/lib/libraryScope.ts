import type { SharedLibrarySnapshot } from "../../shared/sharedLibrary";
import { mergeSharedLibrarySnapshots } from "../../shared/sharedLibrary";
import type { GraphPoint } from "./types";
import { GraphDimensions } from "./graphLayout";

export type LibraryScopeMode = "conglomerate" | "isolate";

export const SHARED_OWNER_CLUSTER_ID = "__shared__";

export type OwnerMetaCluster = {
  id: string;
  name: string;
  center: GraphPoint;
  radius: number;
};

export const isMockContributorId = (contributorId: string): boolean => contributorId.startsWith("mock-user-");

export const getSongOwnerIds = (song: { owners?: Array<{ id: string }> }): string[] =>
  (song.owners ?? []).map((owner) => owner.id);

export const getSongScopeClusterId = (song: { owners?: Array<{ id: string }>; ownerCount?: number }): string => {
  const owners = song.owners ?? [];
  if (owners.length > 1) {
    return SHARED_OWNER_CLUSTER_ID;
  }
  return owners[0]?.id ?? "unknown";
};

export const getEnabledOwnerMetaClusters = (
  songs: Array<{ owners?: Array<{ id: string; name: string }> }>,
  dimensions: GraphDimensions,
  enabledOwnerIds?: string[]
): OwnerMetaCluster[] => {
  const enabled = new Set(enabledOwnerIds ?? []);
  const ownersById = new Map<string, string>();

  songs.forEach((song) => {
    (song.owners ?? []).forEach((owner) => {
      if (enabled.size === 0 || enabled.has(owner.id)) {
        ownersById.set(owner.id, owner.name);
      }
    });
  });

  const ownerIds = [...ownersById.keys()].sort((left, right) =>
    (ownersById.get(left) ?? left).localeCompare(ownersById.get(right) ?? right)
  );

  const hasShared = songs.some((song) => (song.owners?.length ?? 0) > 1);
  const clusterIds = hasShared ? [SHARED_OWNER_CLUSTER_ID, ...ownerIds] : ownerIds;

  const usableWidth = dimensions.width - 96;
  const usableHeight = dimensions.height - 96;
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const orbitRadius = Math.min(usableWidth, usableHeight) * 0.3;
  const metaRadius = Math.min(usableWidth, usableHeight) * 0.11;

  return clusterIds.map((clusterId) => {
    if (clusterId === SHARED_OWNER_CLUSTER_ID) {
      return {
        id: clusterId,
        name: "In common",
        center: { x: centerX, y: centerY },
        radius: metaRadius * 0.85,
      };
    }

    const ownerIndex = ownerIds.indexOf(clusterId);
    const ringCount = ownerIds.length;
    const ringAngle = (ownerIndex / Math.max(1, ringCount)) * Math.PI * 2 - Math.PI / 2;

    return {
      id: clusterId,
      name: ownersById.get(clusterId) ?? clusterId,
      center: {
        x: centerX + orbitRadius * Math.cos(ringAngle),
        y: centerY + orbitRadius * Math.sin(ringAngle),
      },
      radius: metaRadius,
    };
  });
};

export const transformToMetaCluster = (
  innerPoint: GraphPoint,
  innerDimensions: GraphDimensions,
  meta: OwnerMetaCluster
): GraphPoint => {
  const innerCenter = { x: innerDimensions.width / 2, y: innerDimensions.height / 2 };
  const offsetX = innerPoint.x - innerCenter.x;
  const offsetY = innerPoint.y - innerCenter.y;
  const innerRadius = Math.min(innerDimensions.width, innerDimensions.height) / 2;
  const scale = innerRadius > 0 ? meta.radius / innerRadius : 0;
  return {
    x: meta.center.x + offsetX * scale,
    y: meta.center.y + offsetY * scale,
  };
};

export const radialIsolateAxisPosition = (
  song: { id: string },
  metricValue: number,
  metricMin: number,
  metricMax: number,
  meta: OwnerMetaCluster,
  angleSalt: string
): GraphPoint => {
  const normalized =
    metricMax === metricMin ? 0.5 : (metricValue - metricMin) / Math.max(metricMax - metricMin, 1);
  const angle = ((hashUnit(song.id, angleSalt) * 0.85 + 0.075) * Math.PI * 2);
  const radius = normalized * meta.radius * 0.92;
  return {
    x: meta.center.x + radius * Math.cos(angle),
    y: meta.center.y + radius * Math.sin(angle),
  };
};

const hashUnit = (seed: string, salt: string): number => {
  let hash = 0;
  const value = `${seed}:${salt}`;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
};

export const songsForOwnerScope = <T extends { owners?: Array<{ id: string }> }>(
  songs: T[],
  ownerClusterId: string
): T[] => {
  if (ownerClusterId === SHARED_OWNER_CLUSTER_ID) {
    return songs.filter((song) => (song.owners?.length ?? 0) > 1);
  }
  return songs.filter((song) => song.owners?.some((owner) => owner.id === ownerClusterId));
};

export const mergeSnapshotsWithMocks = (
  snapshots: SharedLibrarySnapshot[],
  mockSnapshots: SharedLibrarySnapshot[]
): ReturnType<typeof mergeSharedLibrarySnapshots> => mergeSharedLibrarySnapshots([...snapshots, ...mockSnapshots]);