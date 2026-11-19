import {
  BOX_HALF_SIZES,
  BOX_SIZE_MAX,
  BOX_SIZE_MIN,
  BOX_SIZE_STEP,
  buildScene,
} from './perspective.js';
import { renderOverview, renderPageView, renderReadout } from './render.js';

const SPIN_STEP_DEGREES = 0.35;
const YAW_MAX_DEGREES = 90;
const FULL_TO_HALF_SIZE_RATIO = 2;

const PRESETS = Object.freeze({
  'near-one-point': { yaw: 10, tilt: 0, focal: 4 },
  'two-point': { yaw: 35, tilt: 0, focal: 4 },
  'three-point': { yaw: 35, tilt: 35, focal: 4 },
  'wide-angle': { yaw: 35, tilt: 25, focal: 2 },
});

const byId = (id) => document.getElementById(id);

const controls = {
  yaw: byId('yaw'),
  tilt: byId('tilt'),
  focal: byId('focal'),
};

const sizeControls = [byId('size-length'), byId('size-width'), byId('size-height')];
const sizeOutputs = [
  byId('size-length-out'),
  byId('size-width-out'),
  byId('size-height-out'),
];

const outputs = {
  yaw: byId('yaw-out'),
  tilt: byId('tilt-out'),
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

function readState() {
  return {
    yaw: Number(controls.yaw.value),
    tilt: Number(controls.tilt.value),
    focal: Number(controls.focal.value),
    halfSizes: sizeControls.map((input) => Number(input.value) / FULL_TO_HALF_SIZE_RATIO),
  };
}

function resetSizes() {
  sizeControls.forEach((input, axis) => {
    input.value = BOX_HALF_SIZES[axis] * FULL_TO_HALF_SIZE_RATIO;
  });
}

function draw() {
  const state = readState();
  const scene = buildScene(state);
  state.halfSizes.forEach((half, axis) => {
    sizeOutputs[axis].textContent = (half * FULL_TO_HALF_SIZE_RATIO).toFixed(1);
  });
  outputs.yaw.textContent = `${Math.round(state.yaw)}°`;
  outputs.tilt.textContent = `${Math.round(state.tilt)}°`;
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
  const next = Number(controls.yaw.value) + SPIN_STEP_DEGREES;
  controls.yaw.value = next > YAW_MAX_DEGREES ? 0 : next;
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
  controls.focal.value = preset.focal;
  draw();
}

sizeControls.forEach((input) => {
  input.min = BOX_SIZE_MIN;
  input.max = BOX_SIZE_MAX;
  input.step = BOX_SIZE_STEP;
});
resetSizes();

[...Object.values(controls), ...sizeControls].forEach((input) =>
  input.addEventListener('input', draw),
);

byId('reset-size').addEventListener('click', () => {
  resetSizes();
  draw();
});

spinButton.addEventListener('click', () => (spinning ? stopSpin() : startSpin()));

document.querySelectorAll('[data-preset]').forEach((button) => {
  button.addEventListener('click', () => applyPreset(button.dataset.preset));
});

draw();
