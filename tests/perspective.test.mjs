import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX_LEAN_LIMIT_DEGREES,
  BOX_DISTANCE_MAX,
  BOX_DISTANCE_MIN,
  BOX_HALF_SIZES,
  BOX_OFFSET_LIMITS,
  BOX_SIZE_MAX,
  BOX_SIZE_MIN,
  boxAxes,
  boxCenter,
  cameraUp,
  boxVertices,
  buildScene,
  DEFAULT_BOX_LEAN,
  DEFAULT_BOX_POSITION,
  FOCAL_MIN,
  horizonOffset,
  horizonSegment,
  minBoxDistance,
  VP_PAIRS,
  wrapYaw,
  YAW_PERIOD_DEGREES,
} from '../js/perspective.js';

const TOLERANCE = 1e-6;
const closeTo = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < TOLERANCE,
    `${message ?? ''} expected ${expected}, got ${actual}`,
  );

const sampleStates = [];
const sampleRolls = [-90, -40, 0, 30, 90];
for (const yaw of [5, 35, 80, 100, 135, 170]) {
  for (const tilt of [-50, -20, 10, 30, 55]) {
    for (const roll of sampleRolls) {
      for (const focal of [FOCAL_MIN, 2, 4, 7.5]) {
        sampleStates.push({ yaw, tilt, roll, focal });
      }
    }
  }
}

const rotate = (point, degrees) => {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
};
const signedDistanceToHorizon = ({ a, b, c }, point) =>
  (a * point.x + b * point.y + c) / Math.hypot(a, b);

test('axes are orthonormal', () => {
  for (const { yaw, tilt, roll } of sampleStates) {
    const axes = boxAxes(yaw, tilt, roll);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const dot = axes[i].reduce((sum, c, k) => sum + c * axes[j][k], 0);
        closeTo(dot, i === j ? 1 : 0, `axes ${i},${j}`);
      }
    }
  }
});

test('every pair of vanishing points has dot product -f² from the center of vision', () => {
  for (const state of sampleStates) {
    const scene = buildScene(state);
    assert.ok(scene.vanishingPoints.every(Boolean));
    for (const dot of scene.dotProducts) {
      closeTo(dot, -state.focal * state.focal, JSON.stringify(state));
    }
  }
});

test('the center of vision is the orthocenter of the vanishing point triangle', () => {
  for (const state of sampleStates) {
    const [v1, v2, v3] = buildScene(state).vanishingPoints;
    const sides = [
      [v1, v2, v3],
      [v2, v1, v3],
      [v3, v1, v2],
    ];
    for (const [apex, a, b] of sides) {
      closeTo(apex.x * (a.x - b.x) + apex.y * (a.y - b.y), 0, JSON.stringify(state));
    }
  }
});

test('with a level view the horizontal vanishing points straddle P and satisfy x1·x2 = -f²', () => {
  for (const yaw of [10, 35, 60, 80]) {
    for (const focal of [2, 4, 8]) {
      const scene = buildScene({ yaw, tilt: 0, focal });
      const [v1, v2, v3] = scene.vanishingPoints;
      assert.equal(v3, null);
      closeTo(v1.y, 0);
      closeTo(v2.y, 0);
      assert.ok(v1.x * v2.x < 0);
      closeTo(v1.x * v2.x, -focal * focal);
    }
  }
});

test('wrapYaw keeps any angle inside one turn', () => {
  closeTo(wrapYaw(180), 0);
  closeTo(wrapYaw(180.35), 0.35);
  closeTo(wrapYaw(-10), 170);
  closeTo(wrapYaw(35), 35);
});

test('a half turn of yaw gives the same picture', () => {
  const sortedCorners = (scene) =>
    scene.projected.map(({ x, y }) => [x, y]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (const tilt of [-30, 0, 40]) {
    for (const yaw of [0, 35, 90, 133]) {
      const start = buildScene({ yaw, tilt, roll: 20, focal: 4 });
      const end = buildScene({ yaw: yaw + YAW_PERIOD_DEGREES, tilt, roll: 20, focal: 4 });
      sortedCorners(start).forEach(([x, y], index) => {
        closeTo(sortedCorners(end)[index][0], x);
        closeTo(sortedCorners(end)[index][1], y);
      });
      start.vanishingPoints.forEach((point, axis) => {
        const counterpart = end.vanishingPoints[axis];
        assert.equal(counterpart === null, point === null);
        if (!point) return;
        closeTo(counterpart.x, point.x);
        closeTo(counterpart.y, point.y);
      });
      assert.equal(end.faces.length, start.faces.length);
    }
  }
});

test('near-face-on box has one close and one far horizontal vanishing point', () => {
  const [v1, v2] = buildScene({ yaw: 10, tilt: 0, focal: 4 }).vanishingPoints;
  assert.ok(Math.abs(v2.x) < 1);
  assert.ok(Math.abs(v1.x) > 20);
});

test('at zero yaw and tilt the facing axis sits on P and the other horizontal axis is at infinity', () => {
  const [v1, v2, v3] = buildScene({ yaw: 0, tilt: 0, focal: 4 }).vanishingPoints;
  assert.equal(v1, null);
  assert.equal(v3, null);
  closeTo(v2.x, 0);
  closeTo(v2.y, 0);
});

test('horizon sits f·tan(tilt) from P whatever the roll', () => {
  for (const tilt of [-40, -10, 15, 45]) {
    for (const roll of sampleRolls) {
      for (const focal of [2, 5]) {
        const { horizon } = buildScene({ yaw: 35, tilt, roll, focal });
        closeTo(horizonOffset(horizon), focal * Math.tan((tilt * Math.PI) / 180));
      }
    }
  }
});

test('horizon passes through both horizontal vanishing points', () => {
  for (const roll of sampleRolls) {
    const scene = buildScene({ yaw: 35, tilt: 25, roll, focal: 4 });
    for (const point of scene.vanishingPoints.slice(0, 2)) {
      closeTo(signedDistanceToHorizon(scene.horizon, point), 0, `roll ${roll}`);
    }
  }
});

test('distance to horizon times distance to the vertical vanishing point equals -f²', () => {
  for (const tilt of [-45, -20, 15, 40]) {
    for (const roll of sampleRolls) {
      for (const focal of [2, 4, 6]) {
        const { horizon, vanishingPoints } = buildScene({ yaw: 35, tilt, roll, focal });
        const norm = Math.hypot(horizon.a, horizon.b);
        const vertical =
          (vanishingPoints[2].x * horizon.a + vanishingPoints[2].y * horizon.b) / norm;
        closeTo(horizonOffset(horizon) * vertical, -focal * focal);
      }
    }
  }
});

test('rolling the camera rotates every vanishing point rigidly around P', () => {
  for (const roll of sampleRolls) {
    const level = buildScene({ yaw: 35, tilt: 25, focal: 4 });
    const rolled = buildScene({ yaw: 35, tilt: 25, roll, focal: 4 });
    level.vanishingPoints.forEach((point, axis) => {
      const expected = rotate(point, roll);
      closeTo(rolled.vanishingPoints[axis].x, expected.x, `roll ${roll} x`);
      closeTo(rolled.vanishingPoints[axis].y, expected.y, `roll ${roll} y`);
    });
  }
});

test('the vertical vanishing point stays on the line through P perpendicular to the horizon', () => {
  for (const roll of sampleRolls) {
    const { horizon, vanishingPoints } = buildScene({ yaw: 35, tilt: 25, roll, focal: 4 });
    const along = -horizon.b * vanishingPoints[2].x + horizon.a * vanishingPoints[2].y;
    closeTo(along, 0, `roll ${roll}`);
  }
});

test('the horizon follows the roll angle and is vertical at 90 degrees', () => {
  for (const roll of [-60, -20, 0, 20, 60, 90]) {
    const [start, end] = horizonSegment(
      buildScene({ yaw: 35, tilt: 25, roll, focal: 4 }).horizon,
      5,
    );
    const slope = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
    closeTo(Math.abs(Math.cos((slope - roll) * (Math.PI / 180))), 1, `roll ${roll}`);
  }
  const [start, end] = horizonSegment(
    buildScene({ yaw: 35, tilt: 25, roll: 90, focal: 4 }).horizon,
    5,
  );
  closeTo(start.x, end.x);
});

test('the horizon segment is centered on the point of the horizon nearest to P', () => {
  const { horizon } = buildScene({ yaw: 35, tilt: 25, roll: 30, focal: 4 });
  const [start, end] = horizonSegment(horizon, 7);
  closeTo(Math.hypot(end.x - start.x, end.y - start.y), 14);
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  closeTo(Math.hypot(middle.x, middle.y), Math.abs(horizonOffset(horizon)));
});

test('the horizon is at infinity when the camera looks straight along the vertical', () => {
  assert.equal(horizonSegment({ a: 0, b: 0, c: 4 }, 5), null);
  assert.equal(horizonOffset({ a: 0, b: 0, c: 4 }), null);
});

test('a generic orientation shows three faces, three visible edges per axis group and nine visible edges', () => {
  const scene = buildScene({ yaw: 35, tilt: 25, focal: 4 });
  assert.equal(scene.faces.length, 3);
  assert.equal(scene.edges.length, 12);
  assert.equal(scene.edges.filter((edge) => edge.visible).length, 9);
});

test('a face-on box shows a single face', () => {
  const scene = buildScene({ yaw: 0, tilt: 0, focal: 4 });
  assert.equal(scene.faces.length, 1);
});

const sampleHalfSizes = [
  [BOX_SIZE_MIN / 2, BOX_SIZE_MIN / 2, BOX_SIZE_MIN / 2],
  [BOX_SIZE_MAX / 2, BOX_SIZE_MAX / 2, BOX_SIZE_MAX / 2],
  [BOX_SIZE_MAX / 2, BOX_SIZE_MIN / 2, 1],
  [0.3, 2, BOX_SIZE_MAX / 2],
];

test('box size does not move the vanishing points or the horizon', () => {
  for (const state of sampleStates) {
    const reference = buildScene(state);
    for (const halfSizes of sampleHalfSizes) {
      const resized = buildScene({ ...state, halfSizes });
      assert.deepEqual(resized.vanishingPoints, reference.vanishingPoints);
      assert.deepEqual(resized.horizon, reference.horizon);
      assert.deepEqual(resized.dotProducts, reference.dotProducts);
    }
  }
});

test('box size changes the projected corners', () => {
  const state = { yaw: 35, tilt: 25, focal: 4 };
  const small = buildScene({ ...state, halfSizes: [0.5, 0.5, 0.5] });
  const large = buildScene({ ...state, halfSizes: [2, 2, 2] });
  assert.notDeepEqual(small.projected, large.projected);
});

test('every vertex stays in front of the camera at the largest box size', () => {
  const halfSizes = Array(3).fill(BOX_SIZE_MAX / 2);
  for (const { yaw, tilt, roll } of sampleStates) {
    const axes = boxAxes(yaw, tilt, roll);
    assert.ok(boxVertices(axes, halfSizes).every(([, , z]) => z > 0));
  }
});

const extremePositionsFor = (halfSizes) => {
  const positions = [];
  for (const x of [-BOX_OFFSET_LIMITS[0], 0, BOX_OFFSET_LIMITS[0]]) {
    for (const y of [-BOX_OFFSET_LIMITS[1], 0, BOX_OFFSET_LIMITS[1]]) {
      for (const distance of [minBoxDistance(halfSizes), 7, BOX_DISTANCE_MAX]) {
        positions.push([x, y, distance]);
      }
    }
  }
  return positions;
};
const extremePositions = extremePositionsFor(BOX_HALF_SIZES);

test('the default position leaves the scene unchanged', () => {
  const state = { yaw: 35, tilt: 25, roll: 20, focal: 4 };
  assert.deepEqual(
    buildScene({ ...state, position: DEFAULT_BOX_POSITION }).projected,
    buildScene(state).projected,
  );
});

test('box position does not move the vanishing points, the horizon or the dot products', () => {
  for (const state of sampleStates) {
    const reference = buildScene(state);
    for (const position of extremePositions) {
      const moved = buildScene({ ...state, position });
      assert.deepEqual(moved.vanishingPoints, reference.vanishingPoints);
      assert.deepEqual(moved.horizon, reference.horizon);
      assert.deepEqual(moved.dotProducts, reference.dotProducts);
    }
  }
});

test('box position changes the projected corners', () => {
  const state = { yaw: 35, tilt: 25, focal: 4 };
  assert.notDeepEqual(
    buildScene({ ...state, position: [2, 1, 7] }).projected,
    buildScene(state).projected,
  );
});

test('the nearest allowed distance clears the box in any orientation', () => {
  for (const halfSizes of sampleHalfSizes) {
    assert.ok(minBoxDistance(halfSizes) > Math.hypot(...halfSizes), JSON.stringify(halfSizes));
  }
});

test('the nearest allowed distance never drops below the floor and grows with the box', () => {
  const smallest = Array(3).fill(BOX_SIZE_MIN / 2);
  const largest = Array(3).fill(BOX_SIZE_MAX / 2);
  assert.equal(minBoxDistance(smallest), BOX_DISTANCE_MIN);
  assert.ok(minBoxDistance(largest) > minBoxDistance(BOX_HALF_SIZES));
  assert.ok(minBoxDistance(largest) < BOX_DISTANCE_MAX);
});

test('the default box distance is allowed at the largest size', () => {
  const largest = Array(3).fill(BOX_SIZE_MAX / 2);
  assert.ok(DEFAULT_BOX_POSITION[2] >= minBoxDistance(largest));
});

test('every vertex stays in front of the camera at every extreme position and the largest size', () => {
  for (const halfSizes of sampleHalfSizes) {
    for (const { yaw, tilt, roll } of sampleStates) {
      const axes = boxAxes(yaw, tilt, roll);
      for (const position of extremePositionsFor(halfSizes)) {
        const vertices = boxVertices(axes, halfSizes, boxCenter(position, roll));
        assert.ok(
          vertices.every(([, , z]) => z > 0),
          JSON.stringify({ halfSizes, yaw, tilt, roll, position }),
        );
      }
    }
  }
});

test('moving a face-on box sideways or vertically reveals more faces', () => {
  const state = { yaw: 0, tilt: 0, focal: 4 };
  assert.equal(buildScene(state).faces.length, 1);
  assert.equal(buildScene({ ...state, position: [3, 0, 7] }).faces.length, 2);
  assert.equal(buildScene({ ...state, position: [-3, 0, 7] }).faces.length, 2);
  assert.equal(buildScene({ ...state, position: [0, 3, 7] }).faces.length, 2);
  assert.equal(buildScene({ ...state, position: [3, 3, 7] }).faces.length, 3);
});

test('rolling the camera rotates a displaced box rigidly around P', () => {
  const position = [2.5, -1.5, 6];
  for (const roll of sampleRolls) {
    const level = buildScene({ yaw: 35, tilt: 25, focal: 4, position });
    const rolled = buildScene({ yaw: 35, tilt: 25, roll, focal: 4, position });
    level.projected.forEach((corner, index) => {
      const expected = rotate(corner, roll);
      closeTo(rolled.projected[index].x, expected.x, `roll ${roll} x`);
      closeTo(rolled.projected[index].y, expected.y, `roll ${roll} y`);
    });
  }
});

const leanStates = [];
for (const yaw of [5, 35, 100, 150]) {
  for (const tilt of [-40, 0, 25]) {
    for (const roll of [-60, 0, 45]) {
      for (const away of [-BOX_LEAN_LIMIT_DEGREES, -10, 0, 17, BOX_LEAN_LIMIT_DEGREES]) {
        for (const right of [-BOX_LEAN_LIMIT_DEGREES, 0, 23, BOX_LEAN_LIMIT_DEGREES]) {
          leanStates.push({ yaw, tilt, roll, lean: { away, right }, focal: 4 });
        }
      }
    }
  }
}

test('a leaning box still has orthonormal axes', () => {
  for (const { yaw, tilt, roll, lean } of leanStates) {
    const axes = boxAxes(yaw, tilt, roll, lean);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const dot = axes[i].reduce((sum, c, k) => sum + c * axes[j][k], 0);
        closeTo(dot, i === j ? 1 : 0, `axes ${i},${j}`);
      }
    }
  }
});

test('a leaning box keeps the -f² dot products and the orthocenter at P', () => {
  let checked = 0;
  for (const state of leanStates) {
    const scene = buildScene(state);
    scene.dotProducts.forEach((dot) => {
      if (dot === null) return;
      checked += 1;
      closeTo(dot, -state.focal * state.focal, JSON.stringify(state));
    });
    if (!scene.vanishingPoints.every(Boolean)) continue;
    const [v1, v2, v3] = scene.vanishingPoints;
    for (const [apex, a, b] of [[v1, v2, v3], [v2, v1, v3], [v3, v1, v2]]) {
      closeTo(apex.x * (a.x - b.x) + apex.y * (a.y - b.y), 0, JSON.stringify(state));
    }
  }
  assert.ok(checked > leanStates.length);
});

test('the horizon depends on the camera only, never on the lean', () => {
  for (const { yaw, tilt, roll, lean, focal } of leanStates) {
    const leaning = buildScene({ yaw, tilt, roll, lean, focal });
    const upright = buildScene({ yaw, tilt, roll, focal });
    assert.deepEqual(leaning.horizon, upright.horizon);
    closeTo(horizonOffset(leaning.horizon), focal * Math.tan((tilt * Math.PI) / 180));
  }
});

test('the default lean leaves the scene unchanged', () => {
  const state = { yaw: 35, tilt: 25, roll: 20, focal: 4 };
  assert.deepEqual(
    buildScene({ ...state, lean: DEFAULT_BOX_LEAN }).vanishingPoints,
    buildScene(state).vanishingPoints,
  );
});

test('a leaning box has its horizontal vanishing points off the horizon', () => {
  const upright = buildScene({ yaw: 35, tilt: 10, focal: 4 });
  const leaning = buildScene({
    yaw: 35,
    tilt: 10,
    focal: 4,
    lean: { away: 25, right: 15 },
  });
  for (const point of upright.vanishingPoints.slice(0, 2)) {
    closeTo(signedDistanceToHorizon(upright.horizon, point), 0);
  }
  for (const point of leaning.vanishingPoints.slice(0, 2)) {
    assert.ok(Math.abs(signedDistanceToHorizon(leaning.horizon, point)) > 0.1);
  }
});

test('leaning away tips the top of the box away and leaning right tips it right', () => {
  const topWhenLeaningAway = boxAxes(0, 0, 0, { away: 30, right: 0 })[2];
  assert.ok(topWhenLeaningAway[2] > 0);
  const topWhenLeaningRight = boxAxes(0, 0, 0, { away: 0, right: 30 })[2];
  assert.ok(topWhenLeaningRight[0] > 0);
});

test('rolling the camera rotates a leaning box and its horizon rigidly around P', () => {
  const lean = { away: 20, right: -15 };
  for (const roll of sampleRolls) {
    const level = buildScene({ yaw: 35, tilt: 25, focal: 4, lean });
    const rolled = buildScene({ yaw: 35, tilt: 25, roll, focal: 4, lean });
    level.vanishingPoints.forEach((point, axis) => {
      const expected = rotate(point, roll);
      closeTo(rolled.vanishingPoints[axis].x, expected.x, `roll ${roll}`);
      closeTo(rolled.vanishingPoints[axis].y, expected.y, `roll ${roll}`);
    });
    closeTo(horizonOffset(rolled.horizon), horizonOffset(level.horizon));
  }
});

test('the camera up direction matches the old vertical axis for an upright box', () => {
  for (const tilt of [-40, 0, 25]) {
    for (const roll of sampleRolls) {
      const up = cameraUp(tilt, roll);
      boxAxes(35, tilt, roll)[2].forEach((value, index) => closeTo(up[index], value));
    }
  }
});

test('every vertex stays in front of the camera for a leaning box at the extremes', () => {
  const halfSizes = Array(3).fill(BOX_SIZE_MAX / 2);
  for (const { yaw, tilt, roll, lean } of leanStates) {
    const axes = boxAxes(yaw, tilt, roll, lean);
    const nearest = minBoxDistance(halfSizes);
    const vertices = boxVertices(axes, halfSizes, boxCenter([0, 0, nearest], roll));
    assert.ok(vertices.every(([, , z]) => z > 0), JSON.stringify({ yaw, tilt, roll, lean }));
  }
});

test('non-default sizes still show three faces and nine visible edges for a generic view', () => {
  for (const halfSizes of sampleHalfSizes) {
    const scene = buildScene({ yaw: 35, tilt: 25, focal: 4, halfSizes });
    assert.equal(scene.faces.length, 3);
    assert.equal(scene.edges.filter((edge) => edge.visible).length, 9);
  }
});

test('vanishing point pairs cover every combination once', () => {
  assert.equal(VP_PAIRS.length, 3);
  assert.deepEqual(
    new Set(VP_PAIRS.map((pair) => pair.join('-'))),
    new Set(['0-1', '0-2', '1-2']),
  );
});
