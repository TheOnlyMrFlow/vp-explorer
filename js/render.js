import { horizonSegment, VP_PAIRS } from './perspective.js';

export const AXIS_COLORS = Object.freeze(['#D85A30', '#1D9E75', '#7F77DD']);
export const AXIS_NAMES = Object.freeze(['VP₁', 'VP₂', 'VP₃']);

export const PAGE_VIEW = Object.freeze({
  id: 'page',
  width: 680,
  height: 320,
  cx: 340,
  cy: 160,
  scale: 100,
  margin: 22,
});

export const OVERVIEW_VIEW = Object.freeze({
  id: 'overview',
  width: 680,
  height: 280,
  cx: 340,
  cy: 140,
  scale: 10,
  margin: 22,
});

const FRAME_HALF_WIDTH = 2.2;
const FRAME_HALF_HEIGHT = 1.4;
const COORDINATE_LIMIT = 1e5;
const HORIZON_SPAN = 12;
const EDGE_STROKE_WIDTH = 2.2;
const LABEL_GAP = 10;
const LABEL_ROOM = 90;
const LABEL_LIFT = 9;
const ARROW_LABEL_GAP = 14;
const ARROW_POINTS = '0,0 -10,-6 -10,6';
const FAR_DISTANCE = 1e4;

const limit = (value) =>
  Math.max(-COORDINATE_LIMIT, Math.min(COORDINATE_LIMIT, value));

export const formatNumber = (value) => (Math.round(value * 10) / 10 + 0).toFixed(1);

export const toPixel = (point, view) => [
  limit(view.cx + point.x * view.scale),
  limit(view.cy - point.y * view.scale),
];

export function placeInView(pixel, view) {
  const dx = pixel[0] - view.cx;
  const dy = pixel[1] - view.cy;
  const limitX = view.width / 2 - view.margin;
  const limitY = view.height / 2 - view.margin;
  if (Math.abs(dx) <= limitX && Math.abs(dy) <= limitY) {
    return { x: pixel[0], y: pixel[1], outside: false, angle: 0 };
  }
  const ratio = Math.min(
    limitX / Math.max(Math.abs(dx), 1e-9),
    limitY / Math.max(Math.abs(dy), 1e-9),
  );
  return {
    x: view.cx + dx * ratio,
    y: view.cy + dy * ratio,
    outside: true,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

export function vanishingMarker(axisIndex, scene, view) {
  const point = scene.vanishingPoints[axisIndex];
  const name = AXIS_NAMES[axisIndex];
  const color = AXIS_COLORS[axisIndex];
  let pixel;
  let label;
  if (point) {
    pixel = toPixel(point, view);
    label = `${name} · ${formatNumber(Math.hypot(point.x, point.y))}`;
  } else {
    const [dx, dy] = scene.axes[axisIndex];
    const norm = Math.hypot(dx, dy) || 1;
    pixel = [
      view.cx + (dx / norm) * FAR_DISTANCE,
      view.cy - (dy / norm) * FAR_DISTANCE,
    ];
    label = `${name} at infinity`;
  }
  const placed = placeInView(pixel, view);
  const onRight = placed.x > view.cx;
  const roomOutward = onRight ? view.width - placed.x : placed.x;
  const outward = !placed.outside && roomOutward >= LABEL_ROOM;
  const direction = (onRight ? -1 : 1) * (outward ? -1 : 1);
  const anchor = direction > 0 ? 'start' : 'end';
  if (!placed.outside) {
    return `<circle cx="${placed.x}" cy="${placed.y}" r="5" fill="${color}"/><text class="svg-label" x="${placed.x + direction * LABEL_GAP}" y="${placed.y - LABEL_LIFT}" text-anchor="${anchor}">${label}</text>`;
  }
  return `<polygon points="${ARROW_POINTS}" fill="${color}" transform="translate(${placed.x},${placed.y}) rotate(${placed.angle})"/><text class="svg-label" x="${placed.x + direction * ARROW_LABEL_GAP}" y="${placed.y - LABEL_LIFT}" text-anchor="${anchor}">${label}</text>`;
}

function horizonMarkup(scene, view) {
  const segment = horizonSegment(scene.horizon, HORIZON_SPAN);
  if (segment === null) return '';
  const [x1, y1] = toPixel(segment[0], view);
  const [x2, y2] = toPixel(segment[1], view);
  return `<line class="horizon" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

function extensionMarkup(scene, view) {
  return scene.edges
    .filter((edge) => edge.visible && scene.vanishingPoints[edge.axis])
    .map((edge) => {
      const from = toPixel(scene.projected[edge.from], view);
      const to = toPixel(scene.projected[edge.to], view);
      const target = toPixel(scene.vanishingPoints[edge.axis], view);
      const nearer =
        Math.hypot(from[0] - target[0], from[1] - target[1]) <
        Math.hypot(to[0] - target[0], to[1] - target[1])
          ? from
          : to;
      return `<line x1="${nearer[0]}" y1="${nearer[1]}" x2="${target[0]}" y2="${target[1]}" stroke="${AXIS_COLORS[edge.axis]}" stroke-width="0.8" stroke-dasharray="4 4" opacity="0.55"/>`;
    })
    .join('');
}

function boxMarkup(scene, view) {
  const faces = scene.faces
    .map(
      (face) =>
        `<polygon class="face" points="${face
          .map((index) => toPixel(scene.projected[index], view).join(','))
          .join(' ')}"/>`,
    )
    .join('');
  const edges = scene.edges
    .map((edge) => {
      const [x1, y1] = toPixel(scene.projected[edge.from], view);
      const [x2, y2] = toPixel(scene.projected[edge.to], view);
      const color = AXIS_COLORS[edge.axis];
      return edge.visible
        ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${EDGE_STROKE_WIDTH}" stroke-linecap="round"/>`
        : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" stroke-dasharray="2 4" opacity="0.4"/>`;
    })
    .join('');
  return faces + edges;
}

function markersMarkup(scene, view) {
  return AXIS_NAMES.map((_, axis) => vanishingMarker(axis, scene, view)).join('');
}

function wrap(view, title, description, content) {
  return `<title>${title}</title><desc>${description}</desc><defs><clipPath id="clip-${view.id}"><rect x="0" y="0" width="${view.width}" height="${view.height}"/></clipPath></defs><g clip-path="url(#clip-${view.id})">${content}</g>`;
}

function centerMark(view) {
  return `<path class="center-mark" d="M${view.cx - 6} ${view.cy}H${view.cx + 6}M${view.cx} ${view.cy - 6}V${view.cy + 6}"/><text class="svg-label" x="${view.cx + 9}" y="${view.cy - 8}">P</text>`;
}

export function renderPageView(scene, view = PAGE_VIEW) {
  const frame = `<rect class="frame" x="${view.cx - FRAME_HALF_WIDTH * view.scale}" y="${view.cy - FRAME_HALF_HEIGHT * view.scale}" width="${FRAME_HALF_WIDTH * 2 * view.scale}" height="${FRAME_HALF_HEIGHT * 2 * view.scale}" rx="4"/>`;
  return wrap(
    view,
    'The box seen through the picture frame',
    'A box drawn in perspective with its edges extended toward their vanishing points and the horizon line.',
    frame +
      horizonMarkup(scene, view) +
      extensionMarkup(scene, view) +
      boxMarkup(scene, view) +
      centerMark(view) +
      markersMarkup(scene, view),
  );
}

export function renderOverview(scene, view = OVERVIEW_VIEW) {
  const points = scene.vanishingPoints;
  const triangle = points.every(Boolean)
    ? `<polygon class="triangle" points="${points.map((p) => toPixel(p, view).join(',')).join(' ')}"/>`
    : '';
  const altitudes = points
    .map((point, axis) => {
      if (!point) return '';
      const [x, y] = toPixel(point, view);
      return `<line x1="${x}" y1="${y}" x2="${view.cx}" y2="${view.cy}" stroke="${AXIS_COLORS[axis]}" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>`;
    })
    .join('');
  const page = `<rect class="page-rect" x="${view.cx - FRAME_HALF_WIDTH * view.scale}" y="${view.cy - FRAME_HALF_HEIGHT * view.scale}" width="${FRAME_HALF_WIDTH * 2 * view.scale}" height="${FRAME_HALF_HEIGHT * 2 * view.scale}" rx="2"/><circle class="center-dot" cx="${view.cx}" cy="${view.cy}" r="3"/><text class="svg-label" x="${view.cx + 8}" y="${view.cy + 22}">P (page)</text>`;
  return wrap(
    view,
    'Zoomed-out view of the vanishing points',
    'The three vanishing points form a triangle whose orthocenter is the center of vision P.',
    horizonMarkup(scene, view) +
      triangle +
      altitudes +
      page +
      markersMarkup(scene, view),
  );
}

export function renderReadout(scene) {
  const cards = [
    { label: '−f²', value: -(scene.focal * scene.focal) },
    ...VP_PAIRS.map(([i, j], index) => ({
      label: `${AXIS_NAMES[i]} · ${AXIS_NAMES[j]} (from P)`,
      value: scene.dotProducts[index],
    })),
  ];
  return cards
    .map(
      ({ label, value }) =>
        `<div class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value === null ? 'n/a (∞)' : formatNumber(value)}</p></div>`,
    )
    .join('');
}
