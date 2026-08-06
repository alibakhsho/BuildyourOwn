# BuildYourOwn — Estimating & Construction Management

Two halves of one product.

**Estimate** — instant construction estimates, quotes, 3D massing, code references and an AI crew, for homeowners, tradies, builders and developers. Turns dimensions, a spreadsheet takeoff, a SketchUp model, or a plain-English brief into an itemised cost, a programme, and a client-ready proposal.

**Manage** — what happens after the quote is accepted: measure quantities straight off a PNG/JPG plan, track budget against committed cost, raise purchase orders and variations, issue progress claims, and push them into Xero or MYOB as drafts.

---

## Quick start

```bash
git clone https://github.com/alibakhsho/BuildyourOwn.git
cd BuildyourOwn
npm install

# Front end only (no AI):
npm run dev            # → http://localhost:5173

# Front end + AI backend together (recommended):
npm run dev:all        # web on :5173, AI proxy on :8787
```

> **To view the app you use `npm run dev` (or `dev:all`) and open http://localhost:5173.**
> `npm run build` only compiles to `dist/` — it does **not** open a browser.

### Enabling the AI features (local)

The Anthropic API key lives **server-side only** — never in the browser or in git.

```bash
cp server/.env.example server/.env
# then edit server/.env and set:
#   ANTHROPIC_API_KEY=sk-ant-...
npm run dev:all
```

Check it's wired: open http://localhost:8787/api/health → `{"ok":true,"hasKey":true}`.

---

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server (live reload) → :5173 |
| `npm run dev:all` | Dev server **+** AI backend (concurrently) |
| `npm run server` | AI backend proxy only (Express) → :8787 |
| `npm run build` | Production build → `dist/` (no browser) |
| `npm run preview` | Serve the built `dist/` → :4173 |
| `npm test` | Headless tests for the takeoff maths and the CM domain logic |

---

## Construction management

Reached from the **Manage** button in the top bar. Left rail: Dashboard, Jobs, Clients, Settings.

A **job** is the unit of work, moving through `lead → estimating → quoted → won → on site → PC → closed`. Each job carries nine modules:

| Module | What it's for |
|---|---|
| Overview | Contract sum, committed cost, gross margin, unclaimed revenue |
| Takeoff | Measure quantities off a plan image (below) |
| Budget | Budget vs committed vs variations, per cost centre, with over-budget flags |
| Purchase orders | Commit cost to suppliers; push to Xero/MYOB |
| Variations | Cost **and** charge tracked separately, so variation margin is visible |
| Claims | Progress claims with retention and GST; push to Xero/MYOB |
| Schedule | Working-day Gantt (weekends excluded) |
| Site diary | Daily log — the evidence base for an EOT claim |
| Documents | Plans, permits, photos |

Existing estimator projects are adopted as jobs automatically on first load; the project itself is untouched, so the estimator keeps working exactly as before.

### Takeoff from a plan image

Upload a **PNG, JPG, WEBP or HEIC**. Then:

1. **Calibrate.** Draw a line along a dimension you know and type its real length. Printed scale ratios are deliberately not trusted: a scanned or photographed plan is almost never at its nominal scale. Measuring is blocked until this is done.
2. **Measure.** Linear runs, areas, volumes, counts. Ortho snapping locks to horizontal/vertical/45°; vertex snapping joins runs cleanly.
3. **Assign** each measurement to a cost item, add a waste allowance and a rate.
4. **Push** the roll-up through to the estimate as priced quote lines.

**AI read plan** sends the sheet to Claude Opus 5 (high-resolution vision) and returns room outlines in image-pixel coordinates, a door/window schedule, and advice on what to calibrate against. Detected outlines are added as ordinary area measurements you can edit — they are a starting point, not a certified takeoff, and the UI says so.

Plan images and photos live in **IndexedDB** (`state/blobstore.js`), not localStorage — one A1 scan would blow the 5 MB localStorage quota on its own. Structured records hold only a `blobId`.

#### Phone photos

Uploads are normalised once, on import, so nothing downstream needs to know a phone was involved:

- **HEIC/HEIF is decoded to JPEG.** Safari can display HEIC; Chrome, Edge and Firefox cannot — and a builder does their take-off on a Windows desktop. The decoder (`heic-to`, a WASM build of libheif) is **lazily imported**, so it is code-split into its own chunk and only downloaded when someone actually drops a HEIC.
- **EXIF rotation is baked into the pixels.** Phones store the sensor's native landscape frame plus a rotation flag rather than rotating the pixels, and decode paths disagree about whether to honour that flag. Left alone, a plan shot in portrait can be drawn on its side with width and height transposed — which silently corrupts every measurement taken from it. `test/exif.test.mjs` covers the tag parser against hand-built JPEG headers in both endiannesses.

An already-upright PNG or JPEG is stored **byte-for-byte untouched** — re-encoding costs detail for nothing, and the detail that matters is the figured dimensions the whole take-off is calibrated against. A sheet that *was* converted is flagged in the UI, on both the sheet card and the canvas.

> **A photo taken at an angle cannot be fully corrected.** Calibration assumes one uniform scale across the image; perspective means the far edge of the sheet is at a different scale from the near edge. Shoot square-on and flat, calibrate against the longest figured dimension, and treat long runs across the drawing as approximate. Multi-viewport detail sheets have a related limitation: one `pxPerMetre` is stored per sheet, so a sheet carrying several differently-scaled details cannot currently be measured correctly across all of them.

### Accounting (Xero / MYOB)

Progress claims and purchase orders push into the builder's accounting file **as drafts**. Nothing is sent to a client or a supplier from this app — the builder reviews and sends from Xero/MYOB.

OAuth tokens are held **server-side only** in `server/.tokens.json` (gitignored, mode 600); the browser only ever learns *whether* a provider is connected. See `server/.env.example` for the full setup — you need a developer app at each provider and a public HTTPS URL, since neither provider will redirect to a bare `localhost`.

Two dated details worth knowing, both handled in the code:
- **Xero** rotates refresh tokens on every use and expires an unused one after 60 days. Apps created on/after 2 Mar 2026 use granular scopes — paste your app's exact scope string into `XERO_SCOPES`.
- **MYOB** deprecated the legacy `CompanyFile` scope on 1 Sep 2026; the company-file GUID now arrives on the OAuth redirect and `prompt=consent` is required. Pre-change keys still work via the company-file list.

---

## Architecture

Vite + React 18 (JSX, no TypeScript), three.js for 3D, framer-motion for animation. **Styling is inline styles driven by a token object — no Tailwind, no CSS framework.**

```
src/
  App.jsx            # the estimator UI (large, single-file by design)
  modules/           # the management side, one concern per file
    ConstructionManager.jsx   # shell, dashboard, jobs, job modules
    TakeoffCanvas.jsx         # plan measurement (canvas) + sheet manager
    Integrations.jsx          # Xero / MYOB connection UI
  data/              # material / labour / equipment / supplier catalogues + pricing
  logic/             # pure estimators + takeoff.js (measurement maths) — no React, no DOM
  engine/            # three.js — Engine3D (procedural building) + BackgroundScene (ambient)
  ai/                # client.js (chat), vision.js (plan reader), personas.js (the AI crew)
  state/             # projects.js (estimator, localStorage), cm.js (jobs/POs/claims,
                     #   localStorage), blobstore.js (plan images + photos, IndexedDB)
  design/            # system.js (design tokens) + icons.jsx (the SVG icon set)
  lib/               # format helpers, ids, accounting.js (frontend accounting client)
server/
  index.js           # Express proxy holding the API key (LOCAL dev)
  accounting/        # tokens.js (server-side token store), xero.js, myob.js, routes.js
api/
  _lib/plan-reader.js  # prompt + schema shared by both hosts (underscore = not a route)
  ai/chat.js           # Vercel serverless — same job as server/index.js (PRODUCTION)
  ai/vision.js         # Vercel serverless — plan reader
  health.js
test/                # headless tests: takeoff geometry, CM domain logic
```

### Three build modes
Selected from the top-bar toggle — each drives a different estimator and 3D path:
- **Residential** — parametric house (`Estimator`, `Engine3D.buildFromSpec`)
- **High-rise** — feasibility tower estimate (`HighRiseEstimator`, `Engine3D.buildTower`)
- **Quote** — line-item quote builder (`MaterialsOnly`); 3D infers a building from the quoted items

### Workflow
Every project is one workspace walked as a linear-but-jumpable flow:
**Estimate → 3D → Materials → Timeline → AI → Quote → Proposal** (pinned stepper).

### 3D engine note
The Three.js engine mounts via a **callback ref** (`attachViewport` in App.jsx), not a one-shot effect — the viewport doesn't exist on the landing screen and unmounts on the AI/Proposal stages, so the engine is created when its container first lands in the DOM and re-attached (`Engine3D.remount`) afterwards.

---

## Design system

`src/design/system.js` is the single source of truth, ordered:
**Colors → Typography → Spacing → Radius → Elevation → Motion → Icons → Components → Charts → Forms → Tables → 3D Objects.**
`App.jsx`'s `TOKENS` object **is** `DesignSystem.colors`, so every `TOKENS.ink` / `TOKENS.hivis` call site reads from it.

**Icons** are hand-built inline SVG in `src/design/icons.jsx` (24×24 viewBox, `currentColor` stroke, round caps). Use them via `<Icon name="electrical" />` or `<Icon name="persona.structural" size={18} />`. Groups: `workflow`, `trade`, `equip`, `persona`, `audience`, `ui`.

---

## AI model tiering

To control cost, AI calls are tiered in `src/ai/client.js` (`MODELS`):

| Tier | Model | Used for |
|------|-------|----------|
| `fast` | Haiku 4.5 | structured JSON tasks — job decomposition, build sequence, tower-param extraction |
| `smart` | Sonnet 5 | the AI crew specialist conversations |
| `max` | Opus 5 | opt-in heavy reasoning |

Callers pass `tier` to `chat()`; an explicit `model` overrides; omitting both defers to the backend default (`BYO_AI_MODEL` env var, or Opus 5). Re-tier the whole app by editing the `MODELS` map in one place.

The **plan reader** always uses Opus 5 — it is the high-resolution vision tier (2576 px long edge, coordinates mapping 1:1 to image pixels), which is what makes returned room outlines usable as canvas geometry without a scale factor. Plans are downscaled to a 2400 px long edge before upload: below about that, figured dimensions stop being legible to the model. It uses structured outputs, so the response is schema-valid JSON rather than prose that needs parsing.

---

## Deployment (Vercel)

The repo is Vercel-ready:
- `vercel.json` sets the Vite framework, build command and output dir.
- `api/ai/chat.js` is the serverless AI proxy (replaces the local Express server in production).

To deploy:
1. Import the repo at **vercel.com** (auto-detects Vite).
2. Add env var **`ANTHROPIC_API_KEY`** in Project → Settings → Environment Variables.
3. Deploy. Every push then auto-deploys with a preview URL.

Optional env vars: `BYO_AI_MODEL` (backend default model), `VITE_AI_BACKEND` (point the frontend at a non-same-origin backend).

**The accounting routes are not deployed on Vercel yet.** `server/accounting/*` runs under the Express backend only, and its token store is a local file — fine for a single builder, wrong for multi-tenant. Before going multi-tenant, replace `server/accounting/tokens.js` with per-user encrypted rows in a database; nothing else in the integration has to change.

---

## Regions & disclaimers

Rates and code references support **AU / US / UK**. Code & compliance references link to authoritative sources but are a curated summary, not a reproduction of the law — always verify with a certifier before construction. High-rise figures are feasibility-grade, not tender figures.
