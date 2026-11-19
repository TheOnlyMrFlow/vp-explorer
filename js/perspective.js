export const BOX_HALF_SIZES = Object.freeze([1.6, 1.2, 1.0]);
export const BOX_SIZE_MIN = 0.5;
export const BOX_SIZE_MAX = 4;
export const BOX_SIZE_STEP = 0.1;
export const BOX_DISTANCE = 7;
export const INFINITY_EPSILON = 1e-3;
export const YAW_PERIOD_DEGREES = 180;
export const VP_PAIRS = Object.freeze([
  [0, 1],
  [0, 2],
  [1, 2],
]);

const AXIS_COUNT = 3;
const VERTEX_COUNT = 8;
const HORIZON_EPSILON = 1e-9;

const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cornerSign = (vertexIndex, axis) => ((vertexIndex >> axis) & 1 ? 1 : -1);
const faceIndex = (axis, sign) => axis * 2 + (sign > 0 ? 1 : 0);

export const wrapYaw = (degrees) =>
  ((degrees % YAW_PERIOD_DEGREES) + YAW_PERIOD_DEGREES) % YAW_PERIOD_DEGREES;

export function boxAxes(yawDegrees, tiltDegrees, rollDegrees = 0) {
  const yaw = degreesToRadians(yawDegrees);
  const tilt = degreesToRadians(tiltDegrees);
  const roll = degreesToRadians(rollDegrees);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const worldAxes = [
    [cosYaw, 0, sinYaw],
    [-sinYaw, 0, cosYaw],
    [0, 1, 0],
  ];
  const tiltAxis = ([x, y, z]) => [
    x,
    y * cosTilt + z * sinTilt,
    -y * sinTilt + z * cosTilt,
  ];
  const rollAxis = ([x, y, z]) => [
    x * cosRoll - y * sinRoll,
    x * sinRoll + y * cosRoll,
    z,
  ];
  return worldAxes.map((axis) => rollAxis(tiltAxis(axis)));
}

export function boxVertices(
  axes,
  halfSizes = BOX_HALF_SIZES,
  distance = BOX_DISTANCE,
) {
  const vertices = [];
  for (let i = 0; i < VERTEX_COUNT; i += 1) {
    const point = [0, 0, distance];
    for (let axis = 0; axis < AXIS_COUNT; axis += 1) {
      const extent = cornerSign(i, axis) * halfSizes[axis];
      for (let c = 0; c < 3; c += 1) {
        point[c] += extent * axes[axis][c];
      }
    }
    vertices.push(point);
  }
  return vertices;
}

export function projectPoint([x, y, z], focal) {
  return { x: (focal * x) / z, y: (focal * y) / z };
}

export function vanishingPoints(axes, focal) {
  return axes.map((axis) =>
    Math.abs(axis[2]) < INFINITY_EPSILON ? null : projectPoint(axis, focal),
  );
}

export function faceVisibility(
  axes,
  halfSizes = BOX_HALF_SIZES,
  distance = BOX_DISTANCE,
) {
  const visibility = new Array(AXIS_COUNT * 2).fill(false);
  for (let axis = 0; axis < AXIS_COUNT; axis += 1) {
    for (const sign of [-1, 1]) {
      const normal = axes[axis].map((c) => c * sign);
      const center = [0, 0, distance].map(
        (c, i) => c + sign * halfSizes[axis] * axes[axis][i],
      );
      visibility[faceIndex(axis, sign)] = dot3(normal, center) < 0;
    }
  }
  return visibility;
}

export function visibleFaces(visibility) {
  const faces = [];
  for (let axis = 0; axis < AXIS_COUNT; axis += 1) {
    for (const sign of [-1, 1]) {
      if (!visibility[faceIndex(axis, sign)]) continue;
      const first = (axis + 1) % AXIS_COUNT;
      const second = (axis + 2) % AXIS_COUNT;
      const base = sign > 0 ? 1 << axis : 0;
      faces.push(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([u, v]) => base | (u << first) | (v << second)),
      );
    }
  }
  return faces;
}

export function boxEdges(visibility) {
  const edges = [];
  for (let axis = 0; axis < AXIS_COUNT; axis += 1) {
    const first = (axis + 1) % AXIS_COUNT;
    const second = (axis + 2) % AXIS_COUNT;
    for (let from = 0; from < VERTEX_COUNT; from += 1) {
      if ((from >> axis) & 1) continue;
      const visible =
        visibility[faceIndex(first, cornerSign(from, first))] ||
        visibility[faceIndex(second, cornerSign(from, second))];
      edges.push({ from, to: from | (1 << axis), axis, visible });
    }
  }
  return edges;
}

export function horizonLine(axes, focal) {
  const [a, b, z] = axes[2];
  return { a, b, c: z * focal };
}

export function horizonOffset(line) {
  const norm = Math.hypot(line.a, line.b);
  return norm < HORIZON_EPSILON ? null : -line.c / norm;
}

export function horizonSegment(line, halfLength) {
  const offset = horizonOffset(line);
  if (offset === null) return null;
  const norm = Math.hypot(line.a, line.b);
  const normal = { x: line.a / norm, y: line.b / norm };
  const foot = { x: normal.x * offset, y: normal.y * offset };
  const direction = { x: -normal.y, y: normal.x };
  return [
    { x: foot.x - direction.x * halfLength, y: foot.y - direction.y * halfLength },
    { x: foot.x + direction.x * halfLength, y: foot.y + direction.y * halfLength },
  ];
}

export function pairwiseDotProducts(points) {
  return VP_PAIRS.map(([i, j]) =>
    points[i] && points[j]
      ? points[i].x * points[j].x + points[i].y * points[j].y
      : null,
  );
}

export function buildScene({ yaw, tilt, roll = 0, focal, halfSizes = BOX_HALF_SIZES }) {
  const axes = boxAxes(yaw, tilt, roll);
  const visibility = faceVisibility(axes, halfSizes);
  const points = vanishingPoints(axes, focal);
  return {
    yaw,
    tilt,
    roll,
    focal,
    halfSizes,
    axes,
    projected: boxVertices(axes, halfSizes).map((vertex) =>
      projectPoint(vertex, focal),
    ),
    vanishingPoints: points,
    faces: visibleFaces(visibility),
    edges: boxEdges(visibility),
    horizon: horizonLine(axes, focal),
    dotProducts: pairwiseDotProducts(points),
  };
}
