import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../js/perspective.js';
import {
  OVERVIEW_VIEW,
  PAGE_VIEW,
  placeInView,
  renderOverview,
  renderPageView,
  renderReadout,
  formatNumber,
} from '../js/render.js';

const states = [
  { yaw: 35, tilt: 25, focal: 4 },
  { yaw: 0, tilt: 0, focal: 4 },
  { yaw: 10, tilt: 0, focal: 4 },
  { yaw: 35, tilt: 60, focal: 2 },
  { yaw: 90, tilt: -60, focal: 8 },
  { yaw: 35, tilt: 20, roll: 15, focal: 4 },
  { yaw: 35, tilt: 0, roll: 90, focal: 4 },
  { yaw: 35, tilt: 25, roll: -90, focal: 2 },
  { yaw: 10, tilt: -40, roll: 60, focal: 8 },
  { yaw: 35, tilt: 25, focal: 4, position: [4, 3, 4.5] },
  { yaw: 0, tilt: 0, focal: 2, position: [-4, -3, 14] },
  { yaw: 60, tilt: -20, roll: -45, focal: 6, position: [-2, 2, 5] },
];

test('the horizon is drawn at every roll, including a vertical one', () => {
  for (const roll of [-90, -45, 0, 45, 90]) {
    const scene = buildScene({ yaw: 35, tilt: 25, roll, focal: 4 });
    for (const markup of [renderPageView(scene), renderOverview(scene)]) {
      assert.ok(markup.includes('class="horizon"'), `roll ${roll}`);
    }
  }
});

test('a rolled horizon is a sloped line and a vertical horizon has equal x ends', () => {
  const attributes = (roll) => {
    const markup = renderPageView(buildScene({ yaw: 35, tilt: 25, roll, focal: 4 }));
    const [, x1, y1, x2, y2] = markup.match(
      /class="horizon" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
    );
    return { x1: Number(x1), y1: Number(y1), x2: Number(x2), y2: Number(y2) };
  };
  const level = attributes(0);
  assert.equal(level.y1, level.y2);
  const rolled = attributes(20);
  assert.notEqual(rolled.y1, rolled.y2);
  const sideways = attributes(90);
  assert.ok(Math.abs(sideways.x1 - sideways.x2) < 1e-6);
});

test('rendered markup never contains NaN or undefined', () => {
  for (const state of states) {
    const scene = buildScene(state);
    for (const markup of [
      renderPageView(scene),
      renderOverview(scene),
      renderReadout(scene),
    ]) {
      assert.ok(!markup.includes('NaN'), JSON.stringify(state));
      assert.ok(!markup.includes('undefined'), JSON.stringify(state));
      assert.ok(!markup.includes('Infinity'), JSON.stringify(state));
    }
  }
});

test('rendered markup stays clean for extreme box sizes', () => {
  const sizes = [
    [0.25, 0.25, 0.25],
    [2, 2, 2],
    [2, 0.25, 2],
  ];
  for (const state of states) {
    for (const halfSizes of sizes) {
      const scene = buildScene({ ...state, halfSizes });
      for (const markup of [
        renderPageView(scene),
        renderOverview(scene),
        renderReadout(scene),
      ]) {
        assert.ok(!/NaN|undefined|Infinity|-0\.0/.test(markup), JSON.stringify({ state, halfSizes }));
      }
    }
  }
});

test('each view labels all three vanishing points', () => {
  for (const state of states) {
    const scene = buildScene(state);
    for (const markup of [renderPageView(scene), renderOverview(scene)]) {
      for (const name of ['VP₁', 'VP₂', 'VP₃']) {
        assert.ok(markup.includes(name), `${name} missing for ${JSON.stringify(state)}`);
      }
    }
  }
});

test('vanishing points at infinity are labelled as such', () => {
  const markup = renderOverview(buildScene({ yaw: 35, tilt: 0, focal: 4 }));
  assert.ok(markup.includes('VP₃ at infinity'));
});

test('readout shows -f² and one card per vanishing point pair', () => {
  const markup = renderReadout(buildScene({ yaw: 35, tilt: 25, focal: 4 }));
  assert.equal((markup.match(/class="metric"/g) ?? []).length, 4);
  assert.equal((markup.match(/-16\.0/g) ?? []).length, 4);
});

test('readout reports undefined dot products when a vanishing point is at infinity', () => {
  const markup = renderReadout(buildScene({ yaw: 35, tilt: 0, focal: 4 }));
  assert.equal((markup.match(/n\/a/g) ?? []).length, 2);
});

test('placeInView keeps inside points and clamps outside points to the margin', () => {
  const inside = placeInView([PAGE_VIEW.cx + 10, PAGE_VIEW.cy - 10], PAGE_VIEW);
  assert.equal(inside.outside, false);
  const outside = placeInView([PAGE_VIEW.cx + 5000, PAGE_VIEW.cy], PAGE_VIEW);
  assert.equal(outside.outside, true);
  assert.equal(outside.x, PAGE_VIEW.width - PAGE_VIEW.margin);
  assert.equal(outside.y, PAGE_VIEW.cy);
  assert.equal(outside.angle, 0);
});

test('placeInView preserves direction when clamping diagonally', () => {
  const placed = placeInView(
    [OVERVIEW_VIEW.cx + 4000, OVERVIEW_VIEW.cy + 4000],
    OVERVIEW_VIEW,
  );
  assert.equal(placed.outside, true);
  assert.ok(Math.abs(placed.angle - 45) < 1e-9);
  const limitX = OVERVIEW_VIEW.width / 2 - OVERVIEW_VIEW.margin;
  const limitY = OVERVIEW_VIEW.height / 2 - OVERVIEW_VIEW.margin;
  assert.ok(Math.abs(placed.x - OVERVIEW_VIEW.cx) <= limitX + 1e-9);
  assert.ok(Math.abs(placed.y - OVERVIEW_VIEW.cy) <= limitY + 1e-9);
});

test('formatNumber never prints negative zero', () => {
  assert.equal(formatNumber(-0.0001), '0.0');
  assert.equal(formatNumber(-16), '-16.0');
});
