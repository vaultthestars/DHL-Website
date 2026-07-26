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

/** GPU-friendly viewport transform (applied on an HTML wrapper, not the SVG <g>). */
export const toCssViewportTransform = (transform: ViewTransform): string =>
  `translate3d(${transform.panX}px, ${transform.panY}px, 0) scale(${transform.scale})`;

export const screenToGraphPoint = (
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  viewTransform: ViewTransform = DEFAULT_VIEW_TRANSFORM
): GraphPoint => {
  const rect = svg.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  return {
    x: (screenX - viewTransform.panX) / viewTransform.scale,
    y: (screenY - viewTransform.panY) / viewTransform.scale,
  };
};

export const graphPointToPanelPosition = (
  point: GraphPoint,
  viewTransform: ViewTransform,
  svg: SVGSVGElement
): GraphPoint => {
  const rect = svg.getBoundingClientRect();
  return {
    x: rect.left + viewTransform.panX + point.x * viewTransform.scale,
    y: rect.top + viewTransform.panY + point.y * viewTransform.scale,
  };
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
