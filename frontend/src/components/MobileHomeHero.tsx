import React, { useRef } from "react";
import { Dstring, Hstring, Lstring } from "../LetterData";
import { distortandcenter, getcolorstring } from "../Homepage";

type Point = { x: number; y: number };

const numlayers = 8;
const framedims = { x: 420, y: 200 };
const frameweight = 16;
const logoCenter = { x: 400, y: 200 };

function pointlisttostring(pointlist: Point[]): string {
  return pointlist.map((point) => `${point.x},${point.y}`).join(" ");
}

function getlist(index: number): Point[] {
  if (index === 0) {
    return Dstring;
  }
  if (index === 1) {
    return Hstring;
  }
  return Lstring;
}

function linterp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

const mapPointerToLogo = (clientX: number | null, clientY: number | null, svg: SVGSVGElement | null): Point => {
  if (!svg || clientX === null || clientY === null) {
    return logoCenter;
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return logoCenter;
  }
  return {
    x: ((clientX - rect.left) / rect.width) * 800,
    y: ((clientY - rect.top) / rect.height) * 400,
  };
};

type MobileHomeHeroProps = {
  mouse: { x: number | null; y: number | null };
};

export const MobileHomeHero: React.FC<MobileHomeHeroProps> = ({ mouse }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointer = mapPointerToLogo(mouse.x, mouse.y, svgRef.current);

  return (
    <svg
      ref={svgRef}
      className="mobile-hero__logo"
      viewBox="0 0 800 400"
      aria-hidden="true"
    >
      {Array.from(Array(numlayers * 3).keys()).map((num) => {
        const l0 = Math.floor(num / 3) / (numlayers - 1);
        return (
          <polygon
            key={"mobile-letter-" + num.toString()}
            points={pointlisttostring(
              getlist(num % 3).map((point: Point) =>
                distortandcenter(point, logoCenter, pointer, l0)
              )
            )}
            fill={getcolorstring({ h: 360 * (1 - l0), s: 1 - l0, v: 1 })}
            opacity={(linterp(20, 80, l0)).toString() + "%"}
            stroke="none"
          />
        );
      })}
      <rect
        x={logoCenter.x - framedims.x}
        y={logoCenter.y - framedims.y}
        width={2 * framedims.x}
        height={2 * framedims.y}
        fill="none"
        stroke="hsl(0 0% 100%)"
        strokeWidth={frameweight}
      />
    </svg>
  );
};
