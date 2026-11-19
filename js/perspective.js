export const BOX_HALF_SIZES = Object.freeze([1.6, 1.2, 1.0]);
export const BOX_SIZE_MIN = 0.5;
export const BOX_SIZE_MAX = 4;
export const BOX_SIZE_STEP = 0.1;
export const BOX_DISTANCE = 7;
export const BOX_DISTANCE_MIN = 4.5;
export const BOX_DISTANCE_MAX = 14;
export const BOX_OFFSET_LIMITS = Object.freeze([4, 3]);
export const BOX_POSITION_STEP = 0.1;
export const DEFAULT_BOX_POSITION = Object.freeze([0, 0, BOX_DISTANCE]);
export const DEFAULT_BOX_LEAN = Object.freeze({ away: 0, right: 0 });
export const BOX_LEAN_LIMIT_DEGREES = 45;
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

const tiltPoint = ([x, y, z], degrees) => {
  const angle = degreesToRadians(degrees);
  return [
    x,
    y * Math.cos(angle) + z * Math.sin(angle),
    -y * Math.sin(angle) + z * Math.cos(angle),
  ];
};

const rollPoint = ([x, y, z], degrees) => {
  const angle = degreesToRadians(degrees);
  return [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
    z,
  ];
};

const leanAwayPoint = ([x, y, z], degrees) => {
  const angle = degreesToRadians(degrees);
  return [
    x,
    y * Math.cos(angle) - z * Math.sin(angle),
    y * Math.sin(angle) + z * Math.cos(angle),
  ];
};

const leanRightPoint = ([x, y, z], degrees) => {
  const angle = degreesToRadians(degrees);
  return [
    x * Math.cos(angle) + y * Math.sin(angle),
    -x * Math.sin(angle) + y * Math.cos(angle),
    z,
  ];
};

export function cameraUp(tiltDegrees, rollDegrees = 0) {
  return rollPoint(tiltPoint([0, 1, 0], tiltDegrees), rollDegrees);
}

export function boxAxes(
  yawDegrees,
  tiltDegrees,
  rollDegrees = 0,
  lean = DEFAULT_BOX_LEAN,
) {
  const yaw = degreesToRadians(yawDegrees);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const uprightAxes = [
    [cosYaw, 0, sinYaw],
    [-sinYaw, 0, cosYaw],
    [0, 1, 0],
  ];
  return uprightAxes.map((axis) =>
    rollPoint(
      tiltPoint(
        leanRightPoint(leanAwayPoint(axis, lean.away), lean.right),
        tiltDegrees,
      ),
      rollDegrees,
    ),
  );
}

export function boxCenter(position = DEFAULT_BOX_POSITION, rollDegrees = 0) {
  const roll = degreesToRadians(rollDegrees);
  const [x, y, distance] = position;
  return [
    x * Math.cos(roll) - y * Math.sin(roll),
    x * Math.sin(roll) + y * Math.cos(roll),
    distance,
  ];
}

export function boxVertices(
  axes,
  halfSizes = BOX_HALF_SIZES,
  center = DEFAULT_BOX_POSITION,
) {
  const vertices = [];
  for (let i = 0; i < VERTEX_COUNT; i += 1) {
    const point = [...center];
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
  center = DEFAULT_BOX_POSITION,
) {
  const visibility = new Array(AXIS_COUNT * 2).fill(false);
  for (let axis = 0; axis < AXIS_COUNT; axis += 1) {
    for (const sign of [-1, 1]) {
      const normal = axes[axis].map((c) => c * sign);
      const faceCenter = center.map(
        (c, i) => c + sign * halfSizes[axis] * axes[axis][i],
      );
      visibility[faceIndex(axis, sign)] = dot3(normal, faceCenter) < 0;
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

export function horizonLine(up, focal) {
  const [a, b, z] = up;
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

export function buildScene({
  yaw,
  tilt,
  roll = 0,
  focal,
  halfSizes = BOX_HALF_SIZES,
  position = DEFAULT_BOX_POSITION,
  lean = DEFAULT_BOX_LEAN,
}) {
  const axes = boxAxes(yaw, tilt, roll, lean);
  const center = boxCenter(position, roll);
  const visibility = faceVisibility(axes, halfSizes, center);
  const points = vanishingPoints(axes, focal);
  return {
    yaw,
    tilt,
    roll,
    lean,
    focal,
    halfSizes,
    position,
    center,
    axes,
    projected: boxVertices(axes, halfSizes, center).map((vertex) =>
      projectPoint(vertex, focal),
    ),
    vanishingPoints: points,
    faces: visibleFaces(visibility),
    edges: boxEdges(visibility),
    horizon: horizonLine(cameraUp(tilt, roll), focal),
    dotProducts: pairwiseDotProducts(points),
  };
}
