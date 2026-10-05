export type SimNode = {
  id: string;
  letter: string;
  isWordEnd: boolean;
  isRoot: boolean;
  depthFromStart: number;
  depthToEnd: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  birth: number;
  anchorX: number;
  anchorY: number;
  anchorZ: number;
};

export type SimEdge = {
  id: string;
  fromId: string;
  toId: string;
  weight: number;
};

function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/** Birth blend 0→1 over durationMs. */
export function birthStrength(node: SimNode, now: number, durationMs = 520): number {
  return easeOutCubic((now - node.birth) / durationMs);
}

export function syncSimulation(
  prev: SimNode[],
  nextIds: Array<{
    id: string;
    letter: string;
    isWordEnd: boolean;
    isRoot: boolean;
    depthFromStart: number;
    depthToEnd: number;
    anchorX: number;
    anchorY: number;
    anchorZ: number;
  }>,
  now: number
): SimNode[] {
  const prevById = new Map(prev.map((node) => [node.id, node]));
  return nextIds.map((spec) => {
    const existing = prevById.get(spec.id);
    if (existing) {
      return {
        ...existing,
        letter: spec.letter,
        isWordEnd: spec.isWordEnd,
        isRoot: spec.isRoot,
        depthFromStart: spec.depthFromStart,
        depthToEnd: spec.depthToEnd,
        anchorX: spec.anchorX,
        anchorY: spec.anchorY,
        anchorZ: spec.anchorZ,
      };
    }
    return {
      id: spec.id,
      letter: spec.letter,
      isWordEnd: spec.isWordEnd,
      isRoot: spec.isRoot,
      depthFromStart: spec.depthFromStart,
      depthToEnd: spec.depthToEnd,
      x: spec.anchorX,
      y: spec.anchorY,
      z: spec.anchorZ,
      vx: 0,
      vy: 0,
      vz: 0,
      birth: now,
      anchorX: spec.anchorX,
      anchorY: spec.anchorY,
      anchorZ: spec.anchorZ,
    };
  });
}

function clampMag(x: number, y: number, z: number, max: number) {
  const mag = Math.sqrt(x * x + y * y + z * z);
  if (mag <= max || mag < 1e-6) {
    return { x, y, z };
  }
  const scale = max / mag;
  return { x: x * scale, y: y * scale, z: z * scale };
}

/** Project xz onto cylinder radius; keep y. */
export function projectToCylinderSurface(
  x: number,
  y: number,
  z: number,
  radius: number
) {
  const len = Math.sqrt(x * x + z * z) || 1;
  const scale = radius / len;
  return { x: x * scale, y, z: z * scale };
}

/** Softly keep point inside cylinder radius. */
export function clampInsideCylinder(
  x: number,
  y: number,
  z: number,
  radius: number
) {
  const len = Math.sqrt(x * x + z * z);
  if (len <= radius || len < 1e-6) {
    return { x, y, z };
  }
  const scale = radius / len;
  return { x: x * scale, y, z: z * scale };
}

function cylinderTheta(x: number, z: number): number {
  return Math.atan2(z, x);
}

/** Shortest signed angular delta in (-π, π]. */
function shortestDeltaTheta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) {
    d -= Math.PI * 2;
  }
  while (d <= -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

/** Geodesic length on a cylinder surface between two points. */
export function cylinderSurfaceDistance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  radius: number
): number {
  const dTheta = shortestDeltaTheta(cylinderTheta(a.x, a.z), cylinderTheta(b.x, b.z));
  const dy = b.y - a.y;
  return Math.sqrt((radius * dTheta) ** 2 + dy * dy);
}

/**
 * Sample a geodesic along the cylinder wall (helix in unrolled θ,y space).
 * Returns world-space points suitable for projecting into the SVG.
 */
export function sampleCylinderSurfaceArc(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  radius: number,
  samples = 18
): Array<{ x: number; y: number; z: number }> {
  const thetaA = cylinderTheta(a.x, a.z);
  const dTheta = shortestDeltaTheta(thetaA, cylinderTheta(b.x, b.z));
  const dy = b.y - a.y;
  const points: Array<{ x: number; y: number; z: number }> = [];
  const steps = Math.max(2, samples);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const theta = thetaA + dTheta * t;
    const y = a.y + dy * t;
    points.push({
      x: radius * Math.cos(theta),
      y,
      z: radius * Math.sin(theta),
    });
  }
  return points;
}

function isRailNode(node: SimNode): boolean {
  if (node.isRoot) {
    return true;
  }
  if (node.depthFromStart <= 1) {
    return true;
  }
  if (node.isWordEnd || node.depthToEnd <= 0) {
    return true;
  }
  return false;
}

export function stepSimulation(
  nodes: SimNode[],
  edges: SimEdge[],
  opts: {
    now: number;
    dt: number;
    mode: "prefix" | "consolidate";
    cylinderRadius: number;
    halfHeight: number;
    /**
     * 0 = free volume, 1 = fully stuck to the cylinder wall.
     * Animate this for a soft restrict-paths transition.
     */
    surfaceBlend: number;
    draggingIds?: Set<string>;
  }
): SimNode[] {
  const { now, mode, cylinderRadius, halfHeight } = opts;
  const surfaceBlend = Math.min(1, Math.max(0, opts.surfaceBlend));
  const draggingIds = opts.draggingIds ?? new Set<string>();
  const dt = Math.min(0.024, Math.max(0.008, opts.dt));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const forces = new Map<string, { x: number; y: number; z: number }>();
  nodes.forEach((node) => {
    forces.set(node.id, { x: 0, y: 0, z: 0 });
  });

  const addForce = (id: string, fx: number, fy: number, fz: number) => {
    const force = forces.get(id);
    if (!force) {
      return;
    }
    force.x += fx;
    force.y += fy;
    force.z += fz;
  };

  const repulsion = mode === "consolidate" ? 640 : 2400;
  const minDistSq = mode === "consolidate" ? 90 : 36;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dz = a.z - b.z;
      let distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 1) {
        dx = (Math.random() - 0.5) * 0.01;
        dy = (Math.random() - 0.5) * 0.01;
        dz = (Math.random() - 0.5) * 0.01;
        distSq = dx * dx + dy * dy + dz * dz;
      }
      const dist = Math.sqrt(distSq);
      const strength =
        (repulsion * birthStrength(a, now) * birthStrength(b, now)) /
        Math.max(distSq, minDistSq);
      addForce(a.id, (dx / dist) * strength, (dy / dist) * strength, (dz / dist) * strength);
      addForce(b.id, (-dx / dist) * strength, (-dy / dist) * strength, (-dz / dist) * strength);
    }
  }

  // Edge attraction: springs pull nodes toward each other.
  const springK = mode === "consolidate" ? 0.05 : 0.07;
  const defaultRest = mode === "consolidate" ? cylinderRadius * 0.28 : 64;
  edges.forEach((edge) => {
    const a = byId.get(edge.fromId);
    const b = byId.get(edge.toId);
    if (!a || !b) {
      return;
    }

    let rest: number;
    let dist: number;
    let dirX: number;
    let dirY: number;
    let dirZ: number;

    if (mode === "consolidate" && surfaceBlend > 0.001 && !a.isRoot && !b.isRoot) {
      // Blend chord springs toward unrolled geodesics as surface constraint rises.
      const thetaA = cylinderTheta(a.x, a.z);
      const dTheta = shortestDeltaTheta(thetaA, cylinderTheta(b.x, b.z));
      const dy = b.y - a.y;
      const geoDist =
        Math.sqrt((cylinderRadius * dTheta) ** 2 + dy * dy) || 0.001;
      const chordX = b.x - a.x;
      const chordY = b.y - a.y;
      const chordZ = b.z - a.z;
      const chordDist =
        Math.sqrt(chordX * chordX + chordY * chordY + chordZ * chordZ) || 0.001;
      dist = chordDist + (geoDist - chordDist) * surfaceBlend;
      rest = Math.max(
        22,
        Math.abs(a.anchorY - b.anchorY) * 0.55 + cylinderRadius * 0.12
      );
      const pull = (dist - rest) * springK;
      const along = pull / Math.max(dist, 0.001);

      const tAx = -Math.sin(thetaA);
      const tAz = Math.cos(thetaA);
      const thetaB = thetaA + dTheta;
      const tBx = -Math.sin(thetaB);
      const tBz = Math.cos(thetaB);

      const chordFxA = (chordX / chordDist) * pull;
      const chordFyA = (chordY / chordDist) * pull;
      const chordFzA = (chordZ / chordDist) * pull;
      const geoFxA = tAx * cylinderRadius * dTheta * along;
      const geoFyA = dy * along;
      const geoFzA = tAz * cylinderRadius * dTheta * along;
      const geoFxB = -tBx * cylinderRadius * dTheta * along;
      const geoFyB = -dy * along;
      const geoFzB = -tBz * cylinderRadius * dTheta * along;

      addForce(
        a.id,
        chordFxA + (geoFxA - chordFxA) * surfaceBlend,
        chordFyA + (geoFyA - chordFyA) * surfaceBlend,
        chordFzA + (geoFzA - chordFzA) * surfaceBlend
      );
      addForce(
        b.id,
        -chordFxA + (geoFxB + chordFxA) * surfaceBlend,
        -chordFyA + (geoFyB + chordFyA) * surfaceBlend,
        -chordFzA + (geoFzB + chordFzA) * surfaceBlend
      );
      return;
    }

    if (mode === "consolidate") {
      const ady = Math.abs(b.anchorY - a.anchorY);
      rest = Math.max(22, ady * 0.55 + cylinderRadius * 0.18);
    } else {
      const adx = b.anchorX - a.anchorX;
      const ady = b.anchorY - a.anchorY;
      const adz = b.anchorZ - a.anchorZ;
      const anchorDist = Math.sqrt(adx * adx + ady * ady + adz * adz);
      rest = Math.max(18, (anchorDist > 1 ? anchorDist : defaultRest) * 0.62);
    }

    dirX = b.x - a.x;
    dirY = b.y - a.y;
    dirZ = b.z - a.z;
    dist = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 0.001;
    const pull = (dist - rest) * springK;
    addForce(a.id, (dirX / dist) * pull, (dirY / dist) * pull, (dirZ / dist) * pull);
    addForce(b.id, (-dirX / dist) * pull, (-dirY / dist) * pull, (-dirZ / dist) * pull);
  });

  // Soft pull toward layout anchors.
  // Consolidate: start/end rails are hard-pinned later; middles get y-only.
  nodes.forEach((node) => {
    if (draggingIds.has(node.id)) {
      return;
    }
    if (mode === "prefix") {
      addForce(
        node.id,
        (node.anchorX - node.x) * 0.03,
        (node.anchorY - node.y) * 0.03,
        (node.anchorZ - node.z) * 0.03
      );
      return;
    }

    if (node.isRoot || isRailNode(node)) {
      // Hard-pinned after integration — skip soft forces.
      return;
    }

    // Intermediate letters: gentle vertical layering only.
    addForce(node.id, 0, (node.anchorY - node.y) * 0.035, 0);
  });

  const damping = mode === "consolidate" ? 0.92 : 0.86;
  const maxSpeed = mode === "consolidate" ? 5.5 : 14;
  const forceScale = mode === "consolidate" ? 32 : 60;

  return nodes.map((node) => {
    if (draggingIds.has(node.id)) {
      return { ...node, vx: 0, vy: 0, vz: 0 };
    }
    // Prefix cluster hubs & consolidate start/end rails: exact pin.
    if (
      (node.isRoot && mode === "prefix") ||
      (mode === "consolidate" && (node.isRoot || isRailNode(node)))
    ) {
      return {
        ...node,
        x: node.anchorX,
        y: node.anchorY,
        z: node.anchorZ,
        vx: 0,
        vy: 0,
        vz: 0,
      };
    }

    const force = forces.get(node.id) || { x: 0, y: 0, z: 0 };
    let vx = (node.vx + force.x * dt * forceScale) * damping;
    let vy = (node.vy + force.y * dt * forceScale) * damping;
    let vz = (node.vz + force.z * dt * forceScale) * damping;
    const clamped = clampMag(vx, vy, vz, maxSpeed);
    vx = clamped.x;
    vy = clamped.y;
    vz = clamped.z;

    let x = node.x + vx * dt * forceScale;
    let y = node.y + vy * dt * forceScale;
    let z = node.z + vz * dt * forceScale;

    if (mode === "consolidate") {
      // Keep within cylinder height.
      y = Math.max(-halfHeight, Math.min(halfHeight, y));
      if (!node.isRoot) {
        const inside = clampInsideCylinder(x, y, z, cylinderRadius);
        x = inside.x;
        z = inside.z;
        if (surfaceBlend > 0) {
          const projected = projectToCylinderSurface(x, y, z, cylinderRadius);
          x = x + (projected.x - x) * surfaceBlend;
          z = z + (projected.z - z) * surfaceBlend;
          // Dampen radial velocity in proportion to blend.
          const len = Math.sqrt(x * x + z * z) || 1;
          const nx = x / len;
          const nz = z / len;
          const radial = vx * nx + vz * nz;
          vx -= radial * nx * surfaceBlend;
          vz -= radial * nz * surfaceBlend;
        }
      } else {
        x = 0;
        z = 0;
        y = halfHeight;
        vx = 0;
        vy = 0;
        vz = 0;
      }
    }

    return { ...node, x, y, z, vx, vy, vz };
  });
}

export function rotateY(point: { x: number; y: number; z: number }, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

export function rotateX(point: { x: number; y: number; z: number }, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
}

/** Inverse of rotateX(rotateY(p, yaw), pitch). */
export function unrotate(
  point: { x: number; y: number; z: number },
  yaw: number,
  pitch: number
) {
  return rotateY(rotateX(point, -pitch), -yaw);
}
