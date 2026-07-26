import type { PlaylistMetaGraphEdge } from "./playlistMetaGraphEdges";
import type { GraphPoint } from "./types";

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

const circleHullPath = (center: GraphPoint, radius: number): string =>
  `M ${(center.x - radius).toFixed(1)} ${center.y.toFixed(1)} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;

const pointsToHullPath = (points: GraphPoint[], padding: number): string => {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    const point = points[0];
    const radius = Math.max(padding, 18);
    return circleHullPath(point, radius);
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

const estimateClusterHullRadius = (memberCount: number, padding: number): number =>
  Math.max(padding, Math.min(96, padding + Math.sqrt(memberCount) * 3));

/** Phase B: hull around a playlist cluster center plus its meta-graph neighbors. */
export const buildPlaylistNeighborHullPath = (
  playlistId: string,
  center: GraphPoint,
  edges: PlaylistMetaGraphEdge[],
  playlistCenters: Map<string, GraphPoint>,
  memberCount: number,
  padding: number
): string => {
  const neighborCenters: GraphPoint[] = [];
  edges.forEach((edge) => {
    if (edge.leftId === playlistId) {
      const neighbor = playlistCenters.get(edge.rightId);
      if (neighbor) {
        neighborCenters.push(neighbor);
      }
      return;
    }
    if (edge.rightId === playlistId) {
      const neighbor = playlistCenters.get(edge.leftId);
      if (neighbor) {
        neighborCenters.push(neighbor);
      }
    }
  });

  const hullPoints = [center, ...neighborCenters];
  if (hullPoints.length === 1) {
    return circleHullPath(center, estimateClusterHullRadius(memberCount, padding));
  }
  return pointsToHullPath(hullPoints, padding);
};
