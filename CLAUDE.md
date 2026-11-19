# vp-explorer

Static, dependency-free interactive explainer for three-point perspective. A box rotates in front of a camera and the three vanishing points (VPs) move with it, showing that they are constrained rather than free. Audience: people learning perspective drawing (Drawabox 250 box challenge). Vanilla JS ES modules, no framework, no build step. `http-server` is a dev dependency only.

## Commands

- `npm install` installs dev dependencies.
- `npm test` runs the `node:test` suites in `tests/`. Do not pass a directory to `node --test`: on Node 22 it is treated as a module path and fails.
- `npm run serve` serves the project at http://localhost:8080 with caching disabled.
- Opening `index.html` through `file://` does not work because browsers block ES modules there. Always use `npm run serve`.

## Layout

- `index.html`: page structure, controls, explanatory text.
- `css/styles.css`: styles. Light and dark themes through CSS custom properties on `:root`.
- `js/perspective.js`: pure math. No DOM, no globals. Importable from Node.
- `js/render.js`: pure functions that turn a scene into SVG or HTML strings. No DOM access.
- `js/main.js`: the only module that touches the DOM. Reads sliders, calls `buildScene`, assigns `innerHTML`, runs the spin animation and presets.
- `tests/perspective.test.mjs`: geometry invariants.
- `tests/render.test.mjs`: renderer output and view placement.

Deploy only `index.html`, `css/` and `js/`.

## Model and conventions

- Camera at the origin looking along +z. Picture plane at z = f. Picture coordinates have the center of vision P at (0, 0), +x right, +y up.
- The box is centered at (0, 0, `BOX_DISTANCE`). Its axes are ordered `[length, width, vertical]`, which map to VP₁, VP₂, VP₃ and to the colors in `AXIS_COLORS`.
- `boxAxes(yaw, tilt, roll)`: yaw (0° to 180°, wrapped by `wrapYaw`) spins the box about the vertical axis. The box looks the same after a half turn, so 180° is the full period of the picture and the spin loops seamlessly at that point. Positive tilt means the camera looks down, which puts VP₃ below P. Roll (default 0, slider −90° to 90°) is applied last, as a counter-clockwise rotation of the picture about P, so it rotates every VP, the horizon and the box rigidly. With roll 0 the horizon is horizontal and VP₃ lies on the vertical line through P. With roll the horizon tilts by the roll angle and VP₃ stays on the line through P perpendicular to the horizon.
- Vertex index bit k is the sign of axis k (1 means positive). Face index is `axis * 2 + (sign > 0 ? 1 : 0)`.
- A VP is `null` when `|axis.z| < INFINITY_EPSILON`. Renderers must handle `null` by drawing "at infinity" using the axis direction.
- Pixel coordinates are clamped to ±1e5 before reaching SVG.
- Two views, both 680 wide: the page view (100 px per unit, with the frame drawn) and the overview (10 px per unit, fixed). VPs outside a view are drawn as arrows at its edge, labelled with their distance from P in page units.

## Invariants covered by tests

Do not weaken a test to make a change pass. Change a test only when the model itself changes on purpose, and say so.

- Box axes are orthonormal.
- For every pair of VPs, the dot product of their vectors from P equals −f².
- P is the orthocenter of the VP triangle.
- With tilt 0, the horizontal VPs straddle P and `x1 * x2 = -f²`.
- The horizon lies `horizonOffset` = f·tan(tilt) from P along its normal, whatever the roll. That offset times the signed distance of VP₃ along the same normal equals −f².
- Rolling the camera rotates every VP rigidly about P, the horizon passes through VP₁ and VP₂, and a roll of 90° gives a vertical horizon. The horizon is drawn from `horizonSegment` (a point and a direction), never as y(x).
- A generic orientation shows 3 faces and 9 visible edges. A face-on box shows 1 face.
- Box size never moves the VPs, the horizon or the dot products. `buildScene` takes optional `halfSizes` (default `BOX_HALF_SIZES`); the sliders show full sizes in `BOX_SIZE_MIN` to `BOX_SIZE_MAX`, and every vertex stays in front of the camera at the maximum.
- Rendered markup never contains `NaN`, `undefined` or `Infinity`, and never prints `-0.0`.

## Code rules

- Keep `perspective.js` and `render.js` pure and importable from Node. Anything that needs the DOM belongs in `main.js`.
- Write production-ready code. Use named constants instead of magic numbers.
- No inline comments. Make the code self-explanatory through naming and small functions.
- Add or update tests with every behavior change. Run `npm test` before finishing.
- No runtime dependencies. Do not add a framework or a bundler without discussing it first.
- Color is never the only carrier of meaning. Keep labelled controls, `role="img"` on the SVGs and `aria-live` on the readout.
- Axis colors live in two places: `AXIS_COLORS` in `js/render.js` and `.swatch-1` to `.swatch-3` in `css/styles.css`. Keep them in sync.
- Format displayed numbers with `formatNumber`.

## Gotchas

- The yaw slider needs `step="0.1"`. With `step="1"`, the Spin animation's fractional increments are snapped back and the box never moves.
- `main.js` replaces the SVG `innerHTML` on every draw. Do not attach listeners to elements inside the SVGs.
- Each view has its own `clipPath` id (`clip-page`, `clip-overview`). Reusing an id breaks clipping.
- Label placement: markers inside a view put their label on the side with more room, markers clamped to the edge put it inward, and every label is lifted above the horizon line so it is not struck through.

## Working agreement

Start with analysis, not implementation. Read the relevant code, then propose an approach and discuss trade-offs before writing code. If a requested design looks architecturally unsound, say so and suggest alternatives instead of silently implementing it. For UI changes, run `npm run serve` and check the result in a browser at narrow and wide widths, in light and dark mode.

## Known limitations and ideas

- No free box rotation: the box only yaws, and the camera tilts and rolls.
- The overview scale is fixed, so the VP triangle is small at wide angles.
- Not yet tested on Safari or on phones.
