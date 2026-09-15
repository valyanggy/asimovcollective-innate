# Color field

An editable Next.js App Router app of the 3D two-jaw claw interaction concept. The front view is an orthographic camera projection of the same 3D scene shown in the angled view. Two opposing hooked jaws pivot symmetrically around a fixed wrist; proximity and contact use world-space distances.

## Run locally

Requires Node.js 20.9 or later and npm. Node 22 or newer is also supported.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Editing source files updates the local preview automatically. No API keys, account, or external service is required. Three.js is installed and bundled with the app.

## Studies

- `/` — **05**, the original cube study.
- `/05_2` — **05_2**, selectable chess knight, soccer ball, and single sock.
- `/05_3` — **05_3**, the cube study as a coarser print: larger marks, linear ink gradients, and occasional 2–3 cell units.
- `/07` — **07**, a 2D robot face made of rounded word-pills.
- `/09_3` — **09_3**, four draggable text agents in a monochrome metaball field.
- `/10_1` — **10_1**, the 09_3 field dithered with a swappable circular cell (solid, dashed, inverted, or an uploaded SVG/PNG).
- `/10_push/button` — **10_push**, the push-button figure dithered on the default field grid like an LED screen.

Use the study links to switch versions. In 05_2, object changes preserve the current camera and claw closure and pause any running animation. Each object has a 3D mesh, an independent signed-distance shape, and its own surface/contact samples. The knight and sock are stylized solid models; the sock does not simulate cloth deformation. 05_3 keeps the cube and contact model from 05; only the claw marks change.

## Where to edit

| File | Purpose |
| --- | --- |
| `src/components/color-field.tsx` | React controls, camera selection, playback, slider, labels, loading/error states |
| `src/lib/hand-model.ts` | Jaw profiles, hinge angles, wrist shape, particle sampling, 3D distance calculations, field settings |
| `src/lib/object-catalog.ts` | Object names and picker choices |
| `src/lib/objects.ts` | 3D object meshes, shape distances, surface samples, and proximity volumes |
| `src/lib/grid-projection.ts` | Camera-aligned display grid, nearest-depth selection, spacing and non-overlap limits |
| `src/lib/color-field-scene.ts` | Three.js camera, object, particle/voxel rendering, colors, resize handling, graphics cleanup |
| `src/lib/print-marks.ts` | Coarser print lattice, multi-cell marks, linear gradients, and 05_3 inks |
| `src/app/globals.css` | Layout, responsive behavior, light/dark colors, typography, controls |
| `src/app/page.tsx` | Main route |
| `src/app/layout.tsx` | Document metadata |
| `tests/hand-model.test.ts` | Rigid jaw motion, two-sided contact, depth separation, and cube clearance checks |

The `FIELD` constants set sampling sizes and thresholds. The cube is centered at the origin with side length 2 in arbitrary world units. The front camera looks along the Z axis; the fixed wrist enters from the left, while the upper and lower jaws close onto opposite cube faces. `createHandSegments()` builds capsule centerlines, and `sampleHandParticles()` places dots around them.

## Checks and production

```sh
npm test
npm run typecheck
npm run build
npm start
```

Stop the development server before starting the production server on the same port, or choose another port with `npm start -- --port 3001`.

## Scope

- Preserves Front / Angled, Play grasp / Pause, and Claw closure from the original concept.
- The 3D claw and proximity samples are projected to a shared camera-aligned 2D grid. Each cell contains at most one claw particle or proximity tile. Random particle sizes are bounded to leave a visible gap. The closest sample supplies depth, so the opaque object still occludes marks. Contact remains computed on the selected object’s 3D surface.
- This is a simplified kinematic model with geometric contact thresholds. It does not simulate forces, friction, deformable tissue, or a general collision solver. Large geometry edits may require retuning the gesture.
- Rendering requires WebGL 2. Playback respects reduced-motion settings; the slider can still select individual poses.
- The scene disposes its graphics resources and observers during React unmounts and hot reloads.

This working copy is in `/Users/valfromasimov/AC_innate`, separate from the original synced project references.


## 05_3 reset: layers

05_3 now starts from the original 05 claw and cube, with a full-width taller canvas, a larger adjustable grid, and rounded rectangular tiles. Three camera-depth slices keep actual 3D depth, with adjustable screen-space registration offsets and underlayer opacity. The controls affect the drawing only; geometric contact still uses the 3D claw. Edit `src/lib/layered-marks.ts` for the layer geometry and defaults. The previous ellipse treatment is no longer connected to 05_3.

05_3 also has an independent ambient artwork layer: warped violet/blue color washes, warm pockets, a lighter central opening, and fixed fine grain. Its intensity control goes from 0 (original background) to 100. Edit `src/components/ambient-field.tsx` to shape the field. This is a decorative background beneath WebGL and does not affect geometry or contact.

## Current 05_3 claw treatment

The claw now renders solid capsule meshes with standard physical lighting and self-shadows. A material-stage treatment quantizes the lit result into five colors using stochastic thresholds in mesh-local coordinates. The old camera-facing thermal blob shader is disconnected. Grain scale controls sample density (higher is finer); surface noise varies tone at two spatial scales. This uses a material treatment after lighting, not a full-screen filter, so noise follows the articulated mesh. Edit `src/lib/dither-claw.ts`.

05_3 now uses `src/lib/granular-claw.ts`: a seeded volume cloud projected to a fine grid, with small separated circles and fading edge density instead of solid capsule surfaces. Granularity controls grid spacing; Edge diffusion controls the cloud envelope. Underlying 3D contact is unchanged.

## Imported knight

05_3 uses the supplied Elegant Chess Knight GLB, stored in `public/models/elegant-knight.glb`. Transformed surface samples in `src/lib/data/elegant-knight.json` supply the display and geometric contact/proximity samples. `src/lib/knight-metaballs.ts` renders camera-facing circles with smooth unions, a flat white fill and a thin grey boundary; internal merged outlines are removed. The surface is a stylized projection of the imported mesh, not a shaded mesh. Attribution and the embedded CC BY-NC 4.0 license are preserved in `public/models/elegant-knight-attribution.txt`.


05_3 includes a black stepped silhouette fringe, driven by actual 3D distance from knight surface samples to claw capsules. The field grows locally within 0.8 world units; a lighter offset trace suggests stereo disparity. This is a visual encoding, not a stereo-camera reconstruction. Edit `src/lib/proximity-fringe.ts` for range, pixel size and maximum thickness. Existing claw, knight and contact layers remain.

06 adds a fictional decision-tag mosaic inside the active black proximity fringe. Labels and color variants occupy deterministic row slots so the grasp reveals/retracts tags without reshuffling them. The UI identifies the layer as simulated. Edit `src/lib/decision-tag-layout.ts` for phrases/packing and `src/lib/decision-tags.ts` for colors, type and bubble shapes.

06 now renders the solid knight and a receding backdrop using the same linear camera-depth grayscale mapping (near is white, far is black). This replaces the partial lit recognition reveal; the claw and proximity/decision graphics remain. Edit `src/lib/depth-space.ts` for the mapping and backdrop distances, and `src/lib/knight-depth.ts` for the object. The backdrop is a constructed sloping depth plane, not captured environmental depth.


## 07 — Face field

`/07` uses the supplied Innate robot portrait in `public/images/innate-robot.png`. The head, two camera eyes, and short neck are segmented from the image pixels. The photograph is never displayed as a shaded render: the visible artwork consists entirely of flat blue filled pills and muted outlined background pills. `src/lib/face-pills.ts` owns the image crop, segmentation, seeded text packing, and drawing.

Regional sizing uses a shared fine lattice. Fine cells retain the eyes and silhouette; medium cells fill the head; larger cells span empty background regions without overlap. Face cells and Background cells adjust these independently. Shuffle words changes the typography packing. `src/components/face-field.tsx` owns controls, image loading, resize handling, and accessible canvas descriptions.

## 08_system — Quarter-circle system

`/08_system` recreates the circle pattern system as eight 16 × 16 grids on white. Most muted background cells remain complete circles, while a seeded minority become randomly oriented ½- and ¾-circle outlines. Every foreground mark independently rolls a weighted random length: ¼ circles strongly dominate, ½ circles remain common, and ¾ circles appear as occasional accents. The total pattern size also varies randomly around the Density setting rather than using a fixed quota. Those marks connect at cardinal endpoints on tangent circles to form paths, branches, and loops. Pattern transitions fade complete grouped marks in growth order; they never move a mask through the circles or change an arc's geometry.

## 09_system — Circle field

`/09_system` starts a new single-pattern system in black and white. A seeded layer of faint, soft-focus dots sits behind a complete underlay of white-filled, light-grey outlined 5 px grid cells. An organic density field replaces selected grid cells with larger black circles to create a coherent central mass, sparse satellite traces, and intentional negative-space gaps. A restrained subset of those populated cells becomes a local spatial network. Candidate links are limited to 4.2 grid intervals and considered shortest-first; each node independently accepts only one, two, or three connections, crossing links are rejected in most cases, and the overall edge count is capped near one edge per node. This creates multiple small components and leaves isolated dots, with no global stem or long-distance wiring. Each populated cell independently softens outward and fades away, then returns through blur to a crisp black state. The network, outlined grid, and blurred background remain still. Motion pauses for reduced-motion preferences and hidden pages. Refreshing creates a new composition. There are no controls.

Edit `src/lib/circle-system.ts` for the quarter graph, generation, transition timing, and drawing. `src/components/circle-system.tsx` provides Pause / Play, Regenerate, Speed, and Density. Layout is in the matching CSS module. Motion pauses in hidden tabs and respects reduced-motion preferences. Both new directions use Canvas 2D and require no WebGL, network service, or new dependencies.

Validation: `npm run typecheck`, `npm run build -- --webpack`, and the focused tests in `tests/face-pills.test.ts` and `tests/circle-system.test.ts`. The existing `knight-metaballs.test.ts` circle-count assertion also fails in the unchanged original checkout; it is unrelated to these directions.
