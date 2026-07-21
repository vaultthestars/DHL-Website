import { fromNormalizedPosition, GraphDimensions, toNormalizedPosition } from "./graphLayout";
import { GraphPoint, NormalizedPoint } from "./types";

const CLOSE_THRESHOLD_NORMALIZED = 0.012;

export const SQUIGGLY_CLUSTER_COLORS = [
  "#e85d75",
  "#f4a261",
  "#e9c46a",
  "#2a9d8f",
  "#4a90d9",
  "#9b5de5",
  "#f15bb5",
  "#00bbf9",
  "#00f5d4",
];

let nextSquigglyColorIndex = 0;

export const nextSquigglyClusterColor = (): string => {
  const color = SQUIGGLY_CLUSTER_COLORS[nextSquigglyColorIndex % SQUIGGLY_CLUSTER_COLORS.length];
  nextSquigglyColorIndex += 1;
  return color;
};

export const toGraphPoints = (hull: NormalizedPoint[], dimensions: GraphDimensions): GraphPoint[] =>
  hull.map((point) => fromNormalizedPosition(point, dimensions));

export const toNormalizedPoints = (points: GraphPoint[], dimensions: GraphDimensions): NormalizedPoint[] =>
  points.map((point) => toNormalizedPosition(point, dimensions));

export const closePolygon = (points: NormalizedPoint[]): NormalizedPoint[] => {
  if (points.length < 2) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) < CLOSE_THRESHOLD_NORMALIZED) {
    return points.slice(0, -1);
  }
  return points;
};

const perpendicularDistance = (
  point: NormalizedPoint,
  lineStart: NormalizedPoint,
  lineEnd: NormalizedPoint
): number => {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }
  const t =
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
};

const douglasPeucker = (points: NormalizedPoint[], epsilon: number): NormalizedPoint[] => {
  if (points.length <= 2) {
    return points;
  }
  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[end]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
};

export const simplifyPolygon = (points: NormalizedPoint[], epsilon = 0.003): NormalizedPoint[] => {
  const closed = closePolygon(points);
  if (closed.length < 3) {
    return closed;
  }
  const ring = [...closed, closed[0]];
  const simplified = douglasPeucker(ring, epsilon);
  return closePolygon(simplified);
};

export const pointInPolygon = (point: GraphPoint, polygon: GraphPoint[]): boolean => {
  if (polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const distancePointToSegment = (point: GraphPoint, start: GraphPoint, end: GraphPoint): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
};

export const distanceToPolygonBoundary = (point: GraphPoint, polygon: GraphPoint[]): number => {
  if (polygon.length < 2) {
    return Number.POSITIVE_INFINITY;
  }
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    minDistance = Math.min(minDistance, distancePointToSegment(point, start, end));
  }
  return minDistance;
};

export const polygonCentroid = (polygon: GraphPoint[]): GraphPoint => {
  if (polygon.length === 0) {
    return { x: 0, y: 0 };
  }
  const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
};

/** Minimum visible cluster area in graph pixels (roughly 20×20 px). */
export const MIN_SQUIGGLY_CLUSTER_AREA_PX = 400;

export const polygonArea = (polygon: GraphPoint[]): number => {
  if (polygon.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const j = (i + 1) % polygon.length;
    sum += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  return Math.abs(sum) * 0.5;
};

export const isValidSquigglyHull = (
  hull: NormalizedPoint[] | undefined,
  dimensions: GraphDimensions
): boolean => {
  if (!hull || hull.length < 3) {
    return false;
  }
  return polygonArea(toGraphPoints(hull, dimensions)) >= MIN_SQUIGGLY_CLUSTER_AREA_PX;
};

export const translatePolygon = (
  hull: NormalizedPoint[],
  delta: NormalizedPoint
): NormalizedPoint[] => hull.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }));

export const polygonToPath = (polygon: GraphPoint[], close = true): string => {
  if (polygon.length === 0) {
    return "";
  }
  const commands = polygon.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
  if (close) {
    commands.push("Z");
  }
  return commands.join(" ");
};

export const strokeToClosedPath = (points: NormalizedPoint[], dimensions: GraphDimensions): string => {
  const graphPoints = toGraphPoints(closePolygon(points), dimensions);
  return polygonToPath(graphPoints, true);
};

export const findSongIdsInsideHull = (
  hull: NormalizedPoint[],
  songs: Array<{ id: string; position: GraphPoint }>,
  dimensions: GraphDimensions
): string[] => {
  const polygon = toGraphPoints(hull, dimensions);
  if (polygon.length < 3) {
    return [];
  }
  return songs
    .filter((entry) => pointInPolygon(entry.position, polygon))
    .map((entry) => entry.id);
};

export const findSquigglyClusterIdsAtPoint = (
  point: GraphPoint,
  clusters: Array<{ id: string; hull?: NormalizedPoint[] }>,
  dimensions: GraphDimensions
): string[] =>
  clusters
    .filter((cluster) => {
      const polygon = toGraphPoints(cluster.hull ?? [], dimensions);
      return polygon.length >= 3 && pointInPolygon(point, polygon);
    })
    .map((cluster) => cluster.id);
