import { GraphPoint } from "./types";

export type ViewTransform = {
  scale: number;
  panX: number;
  panY: number;
};

export const DEFAULT_VIEW_TRANSFORM: ViewTransform = {
  scale: 1,
  panX: 0,
  panY: 0,
};

export const MIN_ZOOM = 0.35;

const clampMin = (value: number, min: number): number => Math.max(min, value);

export const toViewTransformString = (transform: ViewTransform): string =>
  `translate(${transform.panX} ${transform.panY}) scale(${transform.scale})`;

export const screenToGraphPoint = (
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  contentGroup: SVGGElement | null
): GraphPoint => {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;

  const matrix = contentGroup?.getScreenCTM();
  if (!matrix) {
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
};

export const zoomAtPoint = (
  transform: ViewTransform,
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  deltaY: number
): ViewTransform => {
  const zoomFactor = deltaY < 0 ? 1.12 : 1 / 1.12;
  const newScale = clampMin(transform.scale * zoomFactor, MIN_ZOOM);
  const rect = svg.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  const graphX = (screenX - transform.panX) / transform.scale;
  const graphY = (screenY - transform.panY) / transform.scale;

  return {
    scale: newScale,
    panX: screenX - graphX * newScale,
    panY: screenY - graphY * newScale,
  };
};
