import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX_SIZE_MAX,
  BOX_SIZE_MIN,
  boxAxes,
  boxVertices,
  buildScene,
  horizonY,
  VP_PAIRS,
} from '../js/perspective.js';

const TOLERANCE = 1e-6;
const closeTo = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < TOLERANCE,
    `${message ?? ''} expected ${expected}, got ${actual}`,
  );

const sampleStates = [];
for (const yaw of [5, 20, 35, 55, 80]) {
  for (const tilt of [-50, -20, 10, 30, 55]) {
    for (const focal of [2, 4, 7.5]) {
      sampleStates.push({ yaw, tilt, focal });
    }
  }
}

test('axes are orthonormal', () => {
  for (const { yaw, tilt } of sampleStates) {
    const axes = boxAxes(yaw, tilt);
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

test('horizon height at the center column equals f·tan(tilt)', () => {
  for (const tilt of [-40, -10, 15, 45]) {
    for (const focal of [2, 5]) {
      const { horizon } = buildScene({ yaw: 35, tilt, focal });
      closeTo(horizonY(horizon, 0), focal * Math.tan((tilt * Math.PI) / 180));
    }
  }
});

test('horizon passes through both horizontal vanishing points', () => {
  const scene = buildScene({ yaw: 35, tilt: 25, focal: 4 });
  for (const point of scene.vanishingPoints.slice(0, 2)) {
    closeTo(horizonY(scene.horizon, point.x), point.y);
  }
});

test('distance to horizon times distance to the vertical vanishing point equals f²', () => {
  for (const tilt of [-45, -20, 15, 40]) {
    for (const focal of [2, 4, 6]) {
      const scene = buildScene({ yaw: 35, tilt, focal });
      const horizon = horizonY(scene.horizon, 0);
      const vertical = scene.vanishingPoints[2].y;
      closeTo(horizon * vertical, -focal * focal);
    }
  }
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
  for (const { yaw, tilt } of sampleStates) {
    const axes = boxAxes(yaw, tilt);
    assert.ok(boxVertices(axes, halfSizes).every(([, , z]) => z > 0));
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
