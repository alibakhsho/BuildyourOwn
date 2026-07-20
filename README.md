# BuildYourOwn — Construction Estimator

Instant construction estimates, quotes, 3D massing, code references and an AI crew — for homeowners, tradies, builders and developers. A single-page app that turns dimensions, a spreadsheet takeoff, a SketchUp model, or a plain-English brief into an itemised cost, a programme, and a client-ready proposal.

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

---

## Architecture

Vite + React 18 (JSX, no TypeScript), three.js for 3D, framer-motion for animation. **Styling is inline styles driven by a token object — no Tailwind, no CSS framework.**

```
src/
  App.jsx            # all UI lives here (large, single-file by design)
  data/              # material / labour / equipment / supplier catalogues + pricing
  logic/             # pure estimators (estimator, highrise-estimator, materials-only,
                     #   allocation, wall-builder, validate) — no React, no DOM
  engine/            # three.js — Engine3D (procedural building) + BackgroundScene (ambient)
  ai/                # client.js (calls the backend), personas.js (the AI crew + prompts)
  state/             # projects.js (localStorage persistence)
  design/            # system.js (design tokens) + icons.jsx (the SVG icon set)
  lib/               # format helpers, ids
server/
  index.js           # Express proxy holding the API key (LOCAL dev)
api/
  ai/chat.js         # Vercel serverless function — same job as server/index.js (PRODUCTION)
  health.js
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
| `max` | Opus 4.8 | opt-in heavy reasoning |

Callers pass `tier` to `chat()`; an explicit `model` overrides; omitting both defers to the backend default (`BYO_AI_MODEL` env var, or Opus). Re-tier the whole app by editing the `MODELS` map in one place.

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

---

## Regions & disclaimers

Rates and code references support **AU / US / UK**. Code & compliance references link to authoritative sources but are a curated summary, not a reproduction of the law — always verify with a certifier before construction. High-rise figures are feasibility-grade, not tender figures.
