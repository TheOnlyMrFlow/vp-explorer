import {
  BOX_DISTANCE_MAX,
  BOX_HALF_SIZES,
  BOX_LEAN_LIMIT_DEGREES,
  BOX_OFFSET_LIMITS,
  BOX_POSITION_STEP,
  BOX_SIZE_MAX,
  BOX_SIZE_MIN,
  BOX_SIZE_STEP,
  buildScene,
  DEFAULT_BOX_LEAN,
  DEFAULT_BOX_POSITION,
  FOCAL_MAX,
  FOCAL_MIN,
  FOCAL_STEP,
  minBoxDistance,
  wrapYaw,
} from './perspective.js';
import { formatNumber, renderOverview, renderPageView, renderReadout } from './render.js';

const SPIN_STEP_DEGREES = 0.35;
const FULL_TO_HALF_SIZE_RATIO = 2;

const PRESETS = Object.freeze({
  'one-point': { yaw: 0, tilt: 0, roll: 0, focal: 4 },
  'two-point': { yaw: 35, tilt: 0, roll: 0, focal: 4 },
  'three-point': { yaw: 35, tilt: 35, roll: 0, focal: 4 },
  'wide-angle': { yaw: 35, tilt: 25, roll: 0, focal: 2 },
  'dutch-angle': { yaw: 35, tilt: 20, roll: 15, focal: 4 },
  'leaning-box': { yaw: 35, tilt: 10, roll: 0, focal: 4, lean: { away: 25, right: 15 } },
});

const byId = (id) => document.getElementById(id);

const controls = {
  yaw: byId('yaw'),
  tilt: byId('tilt'),
  roll: byId('roll'),
  focal: byId('focal'),
};

const sizeControls = [byId('size-length'), byId('size-width'), byId('size-height')];
const sizeOutputs = [
  byId('size-length-out'),
  byId('size-width-out'),
  byId('size-height-out'),
];

const leanControls = [byId('lean-away'), byId('lean-right')];
const leanOutputs = [byId('lean-away-out'), byId('lean-right-out')];
const positionControls = [byId('pos-x'), byId('pos-y'), byId('pos-z')];
const positionOutputs = [byId('pos-x-out'), byId('pos-y-out'), byId('pos-z-out')];
const DISTANCE_AXIS = 2;
const positionLimits = [
  [-BOX_OFFSET_LIMITS[0], BOX_OFFSET_LIMITS[0]],
  [-BOX_OFFSET_LIMITS[1], BOX_OFFSET_LIMITS[1]],
  [0, BOX_DISTANCE_MAX],
];

const outputs = {
  yaw: byId('yaw-out'),
  tilt: byId('tilt-out'),
  roll: byId('roll-out'),
  focal: byId('focal-out'),
};

const targets = {
  page: byId('page-view'),
  overview: byId('overview'),
  readout: byId('readout'),
};

const spinButton = byId('spin');

let spinning = false;
let frameHandle = 0;

function readHalfSizes() {
  return sizeControls.map((input) => Number(input.value) / FULL_TO_HALF_SIZE_RATIO);
}

function limitDistanceToBoxSize() {
  const distanceInput = positionControls[DISTANCE_AXIS];
  const nearest = minBoxDistance(readHalfSizes());
  distanceInput.min = nearest;
  if (Number(distanceInput.value) < nearest) distanceInput.value = nearest;
}

function readState() {
  return {
    yaw: Number(controls.yaw.value),
    tilt: Number(controls.tilt.value),
    roll: Number(controls.roll.value),
    focal: Number(controls.focal.value),
    halfSizes: readHalfSizes(),
    position: positionControls.map((input) => Number(input.value)),
    lean: { away: Number(leanControls[0].value), right: Number(leanControls[1].value) },
  };
}

function resetSizes() {
  sizeControls.forEach((input, axis) => {
    input.value = BOX_HALF_SIZES[axis] * FULL_TO_HALF_SIZE_RATIO;
  });
}

function setLean({ away, right }) {
  leanControls[0].value = away;
  leanControls[1].value = right;
}

function resetPosition() {
  positionControls.forEach((input, axis) => {
    input.value = DEFAULT_BOX_POSITION[axis];
  });
}

function draw() {
  limitDistanceToBoxSize();
  const state = readState();
  const scene = buildScene(state);
  state.halfSizes.forEach((half, axis) => {
    sizeOutputs[axis].textContent = (half * FULL_TO_HALF_SIZE_RATIO).toFixed(1);
  });
  leanOutputs[0].textContent = `${Math.round(state.lean.away)}°`;
  leanOutputs[1].textContent = `${Math.round(state.lean.right)}°`;
  state.position.forEach((value, axis) => {
    positionOutputs[axis].textContent = formatNumber(value);
  });
  outputs.yaw.textContent = `${Math.round(state.yaw)}°`;
  outputs.tilt.textContent = `${Math.round(state.tilt)}°`;
  outputs.roll.textContent = `${Math.round(state.roll)}°`;
  outputs.focal.textContent = state.focal.toFixed(1);
  targets.page.innerHTML = renderPageView(scene);
  targets.overview.innerHTML = renderOverview(scene);
  targets.readout.innerHTML = renderReadout(scene);
}

function stopSpin() {
  spinning = false;
  cancelAnimationFrame(frameHandle);
  spinButton.textContent = 'Spin box';
  spinButton.setAttribute('aria-pressed', 'false');
}

function spinFrame() {
  if (!spinning) return;
  controls.yaw.value = wrapYaw(Number(controls.yaw.value) + SPIN_STEP_DEGREES);
  draw();
  frameHandle = requestAnimationFrame(spinFrame);
}

function startSpin() {
  spinning = true;
  spinButton.textContent = 'Stop';
  spinButton.setAttribute('aria-pressed', 'true');
  frameHandle = requestAnimationFrame(spinFrame);
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  stopSpin();
  controls.yaw.value = preset.yaw;
  controls.tilt.value = preset.tilt;
  controls.roll.value = preset.roll;
  controls.focal.value = preset.focal;
  resetPosition();
  setLean(preset.lean ?? DEFAULT_BOX_LEAN);
  draw();
}

sizeControls.forEach((input) => {
  input.min = BOX_SIZE_MIN;
  input.max = BOX_SIZE_MAX;
  input.step = BOX_SIZE_STEP;
});
leanControls.forEach((input) => {
  input.min = -BOX_LEAN_LIMIT_DEGREES;
  input.max = BOX_LEAN_LIMIT_DEGREES;
});
positionControls.forEach((input, axis) => {
  [input.min, input.max] = positionLimits[axis];
  input.step = BOX_POSITION_STEP;
});
controls.focal.min = FOCAL_MIN;
controls.focal.max = FOCAL_MAX;
controls.focal.step = FOCAL_STEP;
resetSizes();
resetPosition();
setLean(DEFAULT_BOX_LEAN);

[...Object.values(controls), ...sizeControls, ...leanControls, ...positionControls].forEach((input) =>
  input.addEventListener('input', draw),
);

byId('reset-box').addEventListener('click', () => {
  resetSizes();
  resetPosition();
  setLean(DEFAULT_BOX_LEAN);
  draw();
});

spinButton.addEventListener('click', () => (spinning ? stopSpin() : startSpin()));

document.querySelectorAll('[data-preset]').forEach((button) => {
  button.addEventListener('click', () => applyPreset(button.dataset.preset));
});

draw();
