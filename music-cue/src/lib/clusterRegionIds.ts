/** Owner-scoped cluster region id helpers (no layout imports). */

export const parseOwnerScopedRegionId = (
  regionId: string
): { ownerId: string | null; clusterId: string } => {
  if (!regionId.startsWith("owner:")) {
    return { ownerId: null, clusterId: regionId };
  }
  const withoutPrefix = regionId.slice("owner:".length);
  const separator = withoutPrefix.indexOf(":");
  if (separator < 0) {
    return { ownerId: withoutPrefix, clusterId: withoutPrefix };
  }
  return {
    ownerId: withoutPrefix.slice(0, separator),
    clusterId: withoutPrefix.slice(separator + 1),
  };
};

export const ownerScopedOverrideKey = (ownerId: string, clusterId: string): string =>
  `${ownerId}::${clusterId}`;
