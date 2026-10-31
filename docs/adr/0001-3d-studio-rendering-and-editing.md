# ADR-0001: 3D Studio — photoreal rendering and piece-level editing in the browser

**Status:** Proposed
**Date:** 2026-10-31
**Deciders:** Ali (owner, BuildYourOwn)

## Context

The 3D model is the product's signature: every stud, bolt, brick, sheet, pipe and plant is a real piece from `src/logic/structure`, shared with the estimate, the drawings and the cut list (about 12 000 pieces for a standard four-bedroom house). The viewer that showed it looked like a diagram:

- a flat gradient sky, a hand-tuned sun, and a studio environment map;
- a procedural grass plane and low-poly icosahedron trees;
- procedural canvas textures with no surface relief;
- click-to-identify only. Nothing could be moved, resized, recoloured, hidden or measured.

The owner asked for a model that looks realistic and where "every detail is viewable and editable, like SketchUp, Rhino or Blender", good enough to sell internationally, with a $20 asset budget on the Higgsfield API wallet.

Forces at play:

- **One model, three consumers.** Estimate, drawings and schedule must keep reading the same member list. Editing must not fork the geometry.
- **It runs everywhere the app runs.** That includes Android and iOS through Capacitor, low-end laptops, and the Microsoft Store web app. No native renderer, no server rendering.
- **12 000+ pieces at interactive frame rates.** That is already solved with one `InstancedMesh` per system × shape × material. Any editor has to work with instances, not one mesh per piece.
- **The team is one non-developer owner plus AI sessions.** Dependencies, build steps and services each carry an ongoing cost.

## Decision

Keep three.js (r160, already a dependency) and the existing engine. Add four layers on top:

1. **`engine/environment.js`** handles sky and site. It uses a physically based sky (three's Preetham `Sky`) whose sun drives the key light colour, the shadows, the fog and an image-based light (PMREM of the dome, rebuilt with a debounce). There are four presets: midday, morning, golden hour and overcast. Optional photographic 360° skies come from the asset pack. The site is a paddock to the horizon with large-scale colour drift, a site pad with a soft edge, photo cut-out trees on crossed billboards, and a tree-line ring.
2. **`engine/renderfx.js`** is the post chain for the high tier: MSAA HDR, then GTAO ambient occlusion, then bloom on the brightest highlights, then a selection outline, then SMAA, then output. The existing device check and frame-time guard still decide the tier. A Studio switch lets the user force photo quality, and that choice is never undone by the guard.
3. **`engine/editor.js`** holds the modelling tools. It does selection (click, shift and ctrl), hover, and a move/rotate/scale gizmo through three's `TransformControls` with millimetre and degree snapping. It also does numeric transforms, paint, hide, isolate, delete, two-click measuring with corner snap, and undo/redo. It exports GLB, keeping instances through `EXT_mesh_gpu_instancing`, plus an edits JSON. Edits are stored **by member mark**, so a rebuild of the same spec re-applies them. The member list itself is never mutated, so estimate, drawings and cut list are unaffected.
4. **`components/Studio3D.jsx`** is the full-screen workspace. It takes over the same engine and canvas through `remount` and hands them back on close. It has a toolbar, an outliner (system, then assembly, then piece, with eye toggles and search), a properties panel, an environment panel and a status bar. It is lazy-loaded, about 11 kB gzipped, and the editor about 20 kB.

Photo assets are generated once by `scripts/gen-3d-assets.mjs` with Qwen Image 3 on the Higgsfield API. They are 15 seamless PBR tiles with derived normal maps, 2 timber boards, 3 skies and 5 keyed foliage cut-outs. The script makes them seamless, derives the relief, keys and despills the cut-outs, and writes WebP files plus `public/textures/manifest.json`. Materials pick up a photo map when the pack is present and fall back to the procedural canvases when it is not. The total is about 6.5 MB, and the spend was about $1.90 (25 renders at $0.075).

## Options considered

### Option A: Extend the three.js engine (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium. Four new modules, no new runtime dependency |
| Cost | About $1.90 of generated assets. No per-user cost |
| Scalability | Instancing already holds 12k+ pieces. Outline proxies are instanced too |
| Team familiarity | High. The same engine every session has worked in |

**Pros:** It keeps the one-model guarantee. It works offline and inside Capacitor. It adds no new dependency or bundle cost for people who never open the Studio. Every existing feature keeps working unchanged: the walkthrough, the cinematic film, section cuts, the CAD-line style and the scroll film.
**Cons:** It is real-time rasterisation, not path tracing, so it has no true global illumination. Editing is piece-level transforms, not parametric. Moving a wall does not re-run the framing rules.

### Option B: Move to react-three-fiber with drei

| Dimension | Assessment |
|-----------|------------|
| Complexity | High. It rewrites a 1 300-line imperative engine and everything that drives it |
| Cost | Weeks of rework |
| Scalability | Same GPU limits. Declarative instancing of 12k pieces needs care |
| Team familiarity | Low in this codebase |

**Pros:** drei ready-mades such as `<Sky>`, `<Environment>`, `<TransformControls>` and `<Outlines>`. Idiomatic React.
**Cons:** It rewrites working code for parity, and puts the film, the walkthrough and the scroll film at risk. It also gives no visual gain over Option A, because both use the same three.js underneath.

### Option C: Embed a commercial viewer or cloud renderer

Candidates are a hosted BIM viewer, or pixel streaming from Unreal or Omniverse.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium to integrate, high to keep two models in sync |
| Cost | Per-seat or per-minute GPU fees, which scale with every free user |
| Scalability | Pixel streaming needs a GPU per concurrent viewer |
| Team familiarity | None |

**Pros:** The best visual ceiling, with ray tracing and true global illumination.
**Cons:** It breaks offline and mobile, adds a vendor and a bill per user, and splits the model from the estimate. That conflicts with how the app makes money: free for homeowners.

### Option D: Path tracer in the browser (three-gpu-pathtracer)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None |
| Scalability | Progressive, with seconds to minutes per still. Not interactive at 12k instanced pieces |
| Team familiarity | Low |

**Pros:** Photographic stills.
**Cons:** It is not interactive, and its instancing support is limited. It is a good follow-up for a "Render" button, not the editing view.

## Trade-off analysis

Options A and B produce the same pixels, because both use the same three.js underneath. B costs a rewrite for developer ergonomics, which does not matter to a one-person team. C buys a higher visual ceiling at the cost of the two properties that make the product work: it is free to run, and the model is the estimate. D is the right tool for final stills but the wrong one for a modelling view. A gets most of the perceived realism from lighting: sky, sun colour, image-based light, ambient occlusion, relief and real-scale photo textures. It adds the editing layer without touching the data model, so it is the best ratio of result to risk.

## Consequences

- **Easier:** realistic presentation at no per-user cost. The client sees their build in a real landscape. Builders can isolate, measure, recolour and export any assembly. GLB export opens the model in Blender, SketchUp or Rhino. A 2× PNG render can go straight into a proposal. Golden-hour and overcast looks take one click.
- **Harder:** the asset pack adds about 6.5 MB to the web build and the phone app. Edits are visual only. They don't change quantities, cost or drawings, and the UI must keep saying so.
- **Revisit:**
  - Persist Studio edits with the project in cloud sync. Today they live only for the session, plus the JSON export.
  - Parametric editing, where dragging a wall end re-runs `frameWall`. It needs the edit to become spec changes, not transforms.
  - An optional path-traced "final render" (Option D) behind the Render button.
  - Whether to drop the 2 MB photo pack from the mobile build, as is already done for the HD film.

## Action items

1. [x] `environment.js`: sky, sun, IBL, fog, site and photo foliage
2. [x] `renderfx.js`: GTAO, bloom, outline, SMAA. User-forced photo quality
3. [x] `editor.js`: selection, gizmo, numeric transforms, paint, hide, isolate, measure, undo, GLB export
4. [x] `Studio3D.jsx`: workspace, outliner, properties, environment, status bar, keyboard, phone layout
5. [x] `scripts/gen-3d-assets.mjs` and `public/textures/`: photo PBR pack on the Higgsfield API wallet
6. [ ] Save Studio edits with the project (cloud sync)
7. [ ] Parametric wall editing that feeds back into the spec and estimate
8. [ ] Path-traced final render behind "Render PNG"
