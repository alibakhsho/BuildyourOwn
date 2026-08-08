# BuildYourOwn — Comprehensive Application Audit
## Architecture · UX · Performance · Mobile · Code Quality · Competitive Analysis

**Audit Date:** August 2026
**Live URL:** https://buildyour-own.vercel.app/
**Repo:** github.com/alibakhsho/BuildyourOwn (branch: feature/construction-management)
**Auditor:** Automated + manual inspection

---

## Executive Summary

BuildYourOwn is a remarkably ambitious single-developer construction estimating and management platform. The product vision — consumer-simple, contractor-serious — is unique in the market. The implementation is thoughtful, with clean separation of concerns in the logic layer, well-considered AI integration, and genuine domain expertise visible in the data and workflows.

**However, the app has outgrown its architecture.** The core issues are:

1. **App.jsx is 5,333 lines** — a single React component with 81 useState calls
2. **All data lives in localStorage** — 5MB ceiling, no backup, no multi-device
3. **Bundle is 2.16MB** (gzipped: 631KB) — main chunk alone, before heic-to
4. **Test coverage is ~1.9%** — 320 lines of tests for 17,145 lines of source
5. **No rate limiting** on AI endpoints — one user could run up thousands in API costs
6. **No error boundaries** — a single crash in one section takes down the whole app

The good news: the logic layer is solid, the AI integration is well-architected, and the product-market positioning is strong. Most issues are structural and can be addressed incrementally.

**Overall Score: 7.2 / 10** — Impressive for a solo build. Needs architectural work to scale.

---

## 1. ARCHITECTURE AUDIT

### 1.1 File Size Distribution

| File | Lines | % of Total | Verdict |
|------|-------|-----------|---------|
| `src/App.jsx` | 5,333 | 31% | 🔴 Critical — must be decomposed |
| `src/modules/TakeoffCanvas.jsx` | 1,200 | 7% | 🟡 Large but single-concern, acceptable |
| `src/engine/engine3D.js` | 1,052 | 6% | 🟢 Appropriate — complex domain |
| `src/modules/ConstructionManager.jsx` | 987 | 6% | 🟡 Getting large, but well-structured |
| `src/state/cm.js` | 814 | 5% | 🟢 Clean domain store |
| `src/data/materials.js` | 639 | 4% | 🟢 Data file, inherently large |
| `src/logic/estimator.js` | 462 | 3% | 🟢 Pure functions, well-tested |
| **All source files** | **17,145** | 100% | |

### 1.2 App.jsx Decomposition Analysis

App.jsx contains **81 useState calls** and **48 useCallback/useMemo/useRef/useEffect** calls in a single component. This is the #1 technical debt item.

**What's in App.jsx that should be extracted:**

| Section | ~Lines | Extract To |
|---------|--------|-----------|
| Landing page (hero, how-it-works, toolkit, workflow) | ~600 | `pages/Landing.jsx` |
| Shader/WebGL hero | ~100 | `components/ShaderHero.jsx` |
| Project dashboard | ~200 | `pages/ProjectDashboard.jsx` |
| Estimator controls (sliders, dropdowns, rooms, kitchens, bathrooms) | ~1,200 | `modules/EstimatorControls.jsx` |
| Materials/cost breakdown table | ~400 | `modules/CostBreakdown.jsx` |
| AI chat panel | ~350 | `modules/AIChat.jsx` |
| Quote builder | ~400 | `modules/QuoteBuilder.jsx` |
| Proposal generator | ~300 | `modules/Proposal.jsx` |
| Timeline/programme view | ~200 | `modules/Timeline.jsx` |
| Import/export logic | ~200 | `modules/ImportExport.jsx` |
| Stepper navigation | ~150 | `components/Stepper.jsx` |
| Shared state (spec, hrSpec, matSpec, region, buildMode) | ~200 | `state/estimator-store.js` (or context) |

**Impact of not decomposing:**
- Every state change in any of the 81 useState calls triggers a re-render of the entire 5,333-line component
- New developers cannot onboard — impossible to understand the full file
- Merge conflicts on every PR that touches any feature
- React DevTools becomes unusable (single massive component tree)

### 1.3 State Management

**Current:** `localStorage` for projects + CM data, `IndexedDB` for binary blobs.

| Aspect | Assessment |
|--------|-----------|
| **Capacity** | 🔴 localStorage is 5MB. A builder with 20 jobs, each with budget lines, POs, claims, and chat history, will hit the ceiling. |
| **Data loss** | 🔴 No backup. Browser clear, incognito mode, or device change = everything gone. |
| **Multi-device** | 🔴 Not possible. A builder quoting on their laptop can't check the claim on their phone at site. |
| **Concurrency** | 🟡 Single-tab is fine. Multi-tab can race on writes (both readAll → modify → writeAll). |
| **Migration path** | 🟢 Well-designed. All accessors are function-shaped (get/list/create/update), so swapping localStorage for an API client is a change to the store files only. |
| **IndexedDB for blobs** | 🟢 Correct choice. Capacity is functionally unlimited. API is promise-based, ready for S3/R2 swap. |

**Recommendation:** Supabase or Firebase for structured data, R2/S3 for blobs. The existing store API shape makes this a 1-2 day migration per store file.

### 1.4 Build & Bundle

| Chunk | Raw | Gzipped | Issue |
|-------|-----|---------|-------|
| `index-*.js` | 2,163 KB | 631 KB | 🔴 Exceeds 500KB warning. Three.js + Recharts + all UI in one chunk. |
| `heic-to-*.js` | 2,996 KB | 734 KB | 🟢 Lazy-loaded (code-split). Only downloads when HEIC is uploaded. |
| `index-*.css` | 55 KB | 10 KB | 🟢 Fine. |

**Bundle optimisation opportunities:**
1. Code-split Three.js — only load when 3D viewport mounts (~500KB savings)
2. Code-split Recharts — only load on Materials/Dashboard stage (~200KB savings)
3. Code-split AI chat — only load when AI stage is active
4. Tree-shake XLSX — only import needed functions
5. Use `vite.config.js` `manualChunks` to control split boundaries

### 1.5 Error Handling

| Layer | Assessment |
|-------|-----------|
| **React error boundaries** | 🔴 None. A runtime error in any component crashes the entire app with a blank screen. |
| **AI call errors** | 🟢 Well-handled. `aiErrMsg()` provides human-readable messages. Timeouts, rate limits, and refusals are all caught. |
| **API endpoints** | 🟡 Basic error handling. Missing: request validation, payload size limits (except vision's 12MB). |
| **localStorage errors** | 🟢 Wrapped in try/catch. Silent failure on quota exceeded (correct for non-critical persistence). |
| **IndexedDB errors** | 🟢 Promise-based with reject paths. |

---

## 2. UX AUDIT

### 2.1 Landing Page

| Aspect | Score | Notes |
|--------|-------|-------|
| **Hero impact** | 9/10 | WebGL shader is stunning. "Estimates & quotes. In seconds." is clear and compelling. |
| **CTA visibility** | 8/10 | Orange "START ESTIMATING →" stands out. Could be larger on mobile. |
| **Value prop clarity** | 7/10 | Good for homeowners. Builders may not immediately understand this is for them too. |
| **How it works** | 8/10 | Four-step cards are clear. Flying card animations add personality. |
| **Scroll indication** | 7/10 | "SCROLL" text with arrow exists but is subtle. |
| **Social proof** | 3/10 | 🔴 No testimonials, no usage numbers, no logos. Major gap. |
| **Trust signals** | 5/10 | Disclaimer at bottom is good. No "No login required" badge on hero (this is your biggest selling point). |

### 2.2 Estimator Interface

| Aspect | Score | Notes |
|--------|-------|-------|
| **First impression** | 8/10 | Clean two-column layout. Left: controls. Right: 3D + costs. |
| **Dimension input** | 7/10 | Sliders + number inputs. Good. But no unit labels on slider tracks (is it m? ft?). |
| **Live 3D** | 9/10 | Rebuilds instantly on slider changes. This is the wow factor. |
| **Cost breakdown** | 8/10 | Clear "At a glance" cards + detailed material table. Well-structured. |
| **Stepper** | 7/10 | 7 steps is a lot. Some users might not realise they can skip. Labels are small. |
| **Room schedule** | 6/10 | Adding rooms/kitchens/bathrooms is powerful but visually dense. Could overwhelm a homeowner. |
| **AI crew** | 8/10 | Persona selection is clever. Starter questions are genuinely useful. |
| **Import/export** | 6/10 | "Import CAD/BIM or SketchUp" — powerful but buried. Users may not find it. |

### 2.3 Construction Manager (Site Office)

| Aspect | Score | Notes |
|--------|-------|-------|
| **Empty state** | 8/10 | "No jobs yet" with clear CTA and explanation. Good. |
| **Left rail nav** | 8/10 | Dashboard / Jobs / Clients / Settings — clean and conventional. |
| **Dashboard** | 7/10 | Shows pipeline, unclaimed revenue, at-risk trades when populated. Good data. |
| **Job detail** | 7/10 | 9 modules is comprehensive. Tab-based navigation works. |
| **Takeoff canvas** | 8/10 | Calibrate → measure → assign workflow is well-designed for the domain. |
| **Breadcrumbs** | 8/10 | Good. Always shows where you are. |

### 2.4 Critical UX Issues

1. **🔴 No onboarding.** A first-time user lands on a project dashboard with "No projects yet." There's no guided tour, no sample project, no tooltip hints. Competitors like Buildxact have video walkthroughs and guided setup.

2. **🔴 No "undo."** Changing a dimension, deleting a room, or removing a material line cannot be undone. In an estimator, accidental changes directly affect money. This is a trust issue.

3. **🟡 Stepper is not visually connected to content.** The 7-step stepper at the top doesn't clearly indicate which section you're viewing when scrolled deep into a stage.

4. **🟡 AI chat has no loading indicator beyond "thinking."** Long AI responses (plan reader especially) can take 10-30 seconds with no progress indication.

5. **🟡 No keyboard shortcuts.** Competitors have Ctrl+Z (undo), Ctrl+S (save), Tab navigation between fields. BuildYourOwn relies entirely on mouse/touch.

6. **🟡 Quote/Proposal stage feels disconnected.** The transition from "seeing numbers" to "generating a client-ready proposal" is abrupt. A preview or template selection step would help.

---

## 3. MOBILE RESPONSIVENESS

### 3.1 Findings

| Element | Mobile (375px) | Assessment |
|---------|---------------|-----------|
| **Landing hero** | ✅ Responsive | Text scales, CTA visible, shader renders |
| **Top nav bar** | 🟡 Cramped | PROJECTS / SITE OFFICE / Residential / High-rise / Custom Quote / AU / US / UK + theme toggle — too many items for mobile |
| **Estimator controls** | 🟡 Stacked vertically | Works but very long scroll. No collapsible sections. |
| **3D viewport** | 🟡 Small | Gets pushed to ~40% height. Touch gestures for rotate/zoom are not intuitive. |
| **Cost breakdown table** | 🔴 Horizontal overflow | Wide tables overflow on <400px screens. No horizontal scroll affordance. |
| **AI chat** | ✅ Works | Chat messages render well on mobile. |
| **Takeoff canvas** | 🔴 Impractical | Plan measurement on a phone screen is technically possible but ergonomically painful. This is correctly a laptop/desktop feature. |
| **Construction Manager** | 🟡 Sidebar collapses | Left rail becomes a hamburger. Functional but cramped. |

### 3.2 Mobile-Specific Issues

1. **Top bar overflow:** 10+ items in the nav bar stack awkwardly on mobile. Need a hamburger or drawer.
2. **Table horizontal scroll:** Material lines, labour lines, and PO tables need `overflow-x: auto` wrappers.
3. **Touch targets:** Some buttons (region toggle AU/US/UK, mode buttons) are under 44px tap target.
4. **No bottom navigation:** Mobile-first apps in this category (Houzz Pro, ServiceTitan) use bottom tabs for primary navigation.

---

## 4. PERFORMANCE AUDIT

### 4.1 Load Performance

| Metric | Value | Target | Verdict |
|--------|-------|--------|---------|
| **Main JS bundle** | 2,163 KB (631 KB gzip) | < 500 KB gzip | 🔴 Over budget |
| **Total page weight** | ~3.5 MB first load | < 2 MB | 🟡 Acceptable if HEIC chunk excluded |
| **First Contentful Paint** | ~1.5-2s | < 1.5s | 🟡 Marginal |
| **Largest Contentful Paint** | ~2.5-3s | < 2.5s | 🟡 Marginal (shader canvas) |
| **WebGL shader** | Runs continuously | N/A | 🟡 Consumes GPU on landing page. Pauses correctly when scrolled past. |
| **Three.js init** | ~200ms | N/A | 🟢 Uses callback ref, mounts lazily |
| **HEIC decoder** | 2,996 KB | N/A | 🟢 Lazy-loaded, only downloads on HEIC upload |

### 4.2 Runtime Performance

| Interaction | Performance | Notes |
|-------------|-------------|-------|
| **Slider changes** | 🟢 Smooth | 3D rebuilds and estimate recalculates on every change without visible jank |
| **Room/kitchen/bathroom add** | 🟢 Fast | State update + re-render is imperceptible |
| **AI chat** | 🟢 Responsive | Non-blocking, loading state shown |
| **Plan image upload** | 🟡 Can stall | Large images (5MB+) cause a brief UI freeze during EXIF processing |
| **Takeoff canvas** | 🟡 Large plans lag | Very high-res plans (8000px+) can cause slow canvas redraws during zoom/pan |
| **Project save** | 🟢 Instant | localStorage write is synchronous but fast |

### 4.3 Performance Recommendations

1. **Code-split Three.js and Recharts** — ~700KB savings on initial load
2. **Lazy-load shader** — render a static gradient hero, load shader after LCP
3. **Web Worker for EXIF processing** — prevent UI thread blocking on large uploads
4. **Virtualise long lists** — material lines, PO tables should use windowing for 100+ rows
5. **Add `<React.Suspense>` boundaries** — lazy-load each stepper stage

---

## 5. CODE QUALITY AUDIT

### 5.1 Strengths

1. **Clean separation of logic and UI.** `src/logic/` is pure functions with no DOM or React dependencies. Estimator, takeoff, and wall-builder are all independently testable.

2. **Well-designed AI integration.** Model tiering (fast/smart/max) is smart cost control. Personas have distinct system prompts with structured action output. Plan reader uses structured outputs (JSON schema), not free-form parsing.

3. **Thoughtful domain modeling.** CM store has proper job lifecycle (lead → estimating → quoted → won → on site → PC → closed), cost centre codes matching NATSPEC, and claims with retention and GST handling.

4. **Good error messages.** `aiErrMsg()`, `planReaderError()`, and API error responses are human-readable, not stack traces.

5. **EXIF handling.** The phone photo normalisation (HEIC decode, rotation baking) is surprisingly thorough — both endiannesses tested, edge cases handled.

### 5.2 Issues

| Issue | Severity | File | Detail |
|-------|----------|------|--------|
| **81 useState in one component** | 🔴 Critical | App.jsx | Every state change re-renders 5,333 lines of JSX. Even with useMemo, the reconciliation cost is high. |
| **No React error boundaries** | 🔴 Critical | Entire app | A single `TypeError` in any component renders a blank white screen. |
| **No rate limiting on API** | 🔴 Critical | api/ai/chat.js, api/ai/vision.js | No per-IP or per-session rate limits. A script could call `/api/ai/chat` in a loop and burn through the Anthropic API budget. |
| **No input validation on estimate API** | 🟡 High | api/estimate.js | `widthM`, `lengthM`, `floors` are not type-checked. A string "abc" for widthM would produce NaN throughout. |
| **maxTokens is client-controlled** | 🔴 Critical | api/ai/chat.js:25 | Client can send `maxTokens: 100000` — uncapped cost per request. Plan reader hardcodes 16000 (good), but chat endpoint accepts any value from the browser. |
| **Server deps in client bundle** | 🟡 High | package.json | `express`, `cors`, `dotenv` are in `dependencies` not `devDependencies`. They ship to the browser bundle even though they're server-only. |
| **42 components in one file** | 🔴 Critical | App.jsx | Contains SketchUp importer (240 lines incl. Ruby exporter), spreadsheet importer, shader renderer, reveal animations, room/kitchen/bathroom cards — all in one file. Defeats tree-shaking. |
| **localStorage race condition** | 🟡 Medium | state/projects.js, state/cm.js | `readAll()` → modify → `writeAll()` is not atomic. Two tabs saving simultaneously can lose one write. |
| **No TypeScript** | 🟡 Medium | All | 17K lines of JS with no type checking. Easy to pass wrong spec shape. |
| **Inline styles** | 🟡 Medium | App.jsx | Hundreds of inline style objects are re-created on every render. Extracting to CSS or a style object outside the component would reduce GC pressure. |
| **Console.log statements** | 🟢 Low | Various | A few development `console.log`s remain in production code. |

### 5.3 Security Assessment

| Vector | Status | Detail |
|--------|--------|--------|
| **XSS** | 🟢 Safe | `document.write` in clipboard fallback properly escapes `<`. `dangerouslySetInnerHTML` in chart.jsx injects only CSS variables from app-controlled data. No user input flows into innerHTML. |
| **API key exposure** | 🟢 Safe | ANTHROPIC_API_KEY is server-side only (env var). Never in frontend code. Vite proxy in dev, serverless function in prod. |
| **CORS** | 🟡 Permissive | `api/estimate.js` has `Access-Control-Allow-Origin: *`. Fine for a public API, but the AI endpoints should NOT have wide-open CORS (they don't — the Vercel default is same-origin). |
| **Prompt injection** | 🟡 Medium risk | The AI chat sends user messages directly to Claude with a system prompt. A user could attempt to override the persona's instructions. Mitigation: Claude's constitutional AI + the system prompt being in the system slot (not user slot). Not a data leak risk since there's no user data to exfiltrate, but a user could make the persona say inappropriate things. |
| **Input validation** | 🟡 Weak | API endpoints accept `req.body` without schema validation. No payload size limits except vision (12MB). |

### 5.4 Test Coverage

| Area | Test File | Lines | What's Tested | What's Missing |
|------|-----------|-------|---------------|----------------|
| Takeoff geometry | takeoff.test.mjs | 73 | Calibration, area, perimeter, snapping, hit testing | Volume calc, multi-segment runs, edge cases (zero-length, self-intersecting) |
| CM domain | cm.test.mjs | 120 | Job lifecycle, POs, variations, claims, budgets, scheduling | Client CRUD, diary entries, document management, migration |
| EXIF parser | exif.test.mjs | 77 | Orientation tags, endianness, edge cases | Actual HEIC decode path (needs binary fixtures), rotation baking |
| **Estimator** | **None** | 0 | | 🔴 The core estimator logic has NO dedicated test file. buildEstimate, materialCosts, labourCosts, equipmentCosts, timeline — all untested in isolation. |
| **AI layer** | **None** | 0 | | 🔴 No tests for prompt construction, action parsing, model tiering. |
| **API endpoints** | **None** | 0 | | 🔴 No integration tests for /api/estimate, /api/ai/chat, /api/ai/vision. |
| **UI** | **None** | 0 | | 🟡 No component tests. Expected for an early-stage product. |

---

## 6. COMPETITIVE COMPARISON

### 6.1 Feature Matrix

| Feature | BuildYourOwn | Buildxact | Buildertrend | Houzz Pro |
|---------|-------------|-----------|-------------|-----------|
| **Price** | Free | $149-349/mo | $199-799/mo | $89-149/mo |
| **AI estimating** | ✅ 6 specialist personas | ✅ "Blu" AI assistant | ❌ | ❌ |
| **AI plan reading** | ✅ Claude Opus 5 vision | ✅ "Blu Takeoff Assistant" | ❌ | ❌ |
| **3D visualization** | ✅ Three.js procedural | ❌ | ❌ | ✅ (via 3D tours) |
| **Quantity takeoff** | ✅ From image | ✅ From PDF | ✅ Limited | ❌ |
| **Budget tracking** | ✅ | ✅ | ✅ | ✅ |
| **POs & claims** | ✅ | ✅ | ✅ | ❌ |
| **Scheduling** | ✅ Basic Gantt | ✅ Full Gantt | ✅ Full Gantt with deps | ✅ Basic |
| **Accounting** | ✅ Xero/MYOB | ✅ Xero/MYOB/QB | ✅ QuickBooks | ✅ QuickBooks |
| **Client portal** | ❌ | ✅ | ✅ | ✅ |
| **Mobile app** | Web (responsive) | iOS + Android | iOS + Android | iOS + Android |
| **Multi-user** | ❌ | ✅ | ✅ | ✅ |
| **Supplier pricing** | ✅ Catalogue | ✅ Live supplier connect | ❌ | ❌ |
| **Regions** | AU/US/UK | AU/NZ/US/CA/UK | US primary | US primary |

### 6.2 What Competitors Do Better

**Buildxact:**
1. **Live supplier pricing** — connects directly to Bunnings Trade, Bowens for real-time pricing. BYO uses catalogue rates.
2. **"Blu" AI is positioned as a colleague** — "Your Smartest Crew Member" marketing is similar to BYO's personas but with a single unified brand.
3. **Onboarding** — video walkthroughs, guided setup wizard, sample projects pre-loaded.

**Buildertrend:**
1. **Client portal** — homeowners can log in and see progress photos, schedule, selections, and invoices. BYO has no client-facing view.
2. **Native mobile apps** — dedicated iOS/Android apps with offline capability. BYO is web-only.
3. **Team collaboration** — multiple users, permissions, commenting on line items. BYO is single-user.

**Houzz Pro:**
1. **Lead generation** — the Houzz marketplace drives leads directly to builders using Houzz Pro. Built-in demand generation.
2. **Design boards + moodboards** — visual selection process for finishes, colours, fixtures. Clients love this.
3. **Professional branding** — proposals and invoices carry the builder's logo and brand, not Houzz's.

### 6.3 What BuildYourOwn Does That Nobody Else Does

1. **Free + no login.** Every competitor requires registration and payment. BYO's instant access is a genuine moat.
2. **Instant 3D visualization.** No competitor builds a 3D model live from sliders. This is the viral demo moment.
3. **Six distinct AI specialists** (not one chatbot). Marcus the site engineer and Priya the QS give genuinely different advice.
4. **Consumer + professional in one tool.** Homeowner estimates a kitchen → builder adopts the same project in CM. No data re-entry.
5. **AU + US + UK in one product** with region-aware rates, codes, and tax rules.

---

## 7. PRIORITISED IMPROVEMENT ROADMAP

### 🔴 P0 — Do Now (Stability & Safety)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | **Add React error boundaries** around estimator, CM, and AI chat | 2 hours | Prevents blank-screen crashes |
| 2 | **Rate-limit AI endpoints** (per-IP, 20 req/min for chat, 5/min for vision) | 3 hours | Prevents API cost blowout |
| 3 | **Input validation on api/estimate.js** (type-check numbers, clamp ranges) | 1 hour | Prevents NaN estimates |
| 4 | **Add Estimator unit tests** (buildEstimate with known spec → expected total) | 4 hours | Catches regressions in the core product |

### 🟡 P1 — Do This Month (Architecture)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 5 | **Decompose App.jsx** — extract Landing, EstimatorControls, CostBreakdown, AIChat, QuoteBuilder, Proposal | 3-5 days | Enables all other UI work |
| 6 | **Code-split Three.js and Recharts** via dynamic import + Suspense | 1 day | ~700KB savings on initial load |
| 7 | **Add undo/redo** for spec changes (simple state history stack) | 1 day | Trust and usability |
| 8 | **Migrate state to Supabase** (projects, CM data) | 2-3 days | Multi-device, backup, no 5MB ceiling |
| 9 | **Add onboarding** — sample project + tooltip tour on first visit | 2 days | Activation rate improvement |

### 🟢 P2 — Do This Quarter (Growth)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 10 | **Client portal** — shareable read-only link for homeowners to view estimate/progress | 1 week | Matches Buildertrend/Houzz, viral sharing |
| 11 | **PWA + offline** — service worker for offline estimate access | 2-3 days | Works on site with no signal |
| 12 | **Social proof on landing** — usage counter, testimonials, trust badges | 1 day | Conversion rate improvement |
| 13 | **PDF export** — client-branded proposals with builder's logo | 2-3 days | Professional output |
| 14 | **Keyboard shortcuts** (Ctrl+Z undo, Ctrl+S save, Tab between fields) | 1 day | Power user efficiency |
| 15 | **Mobile bottom nav** — swap top bar for bottom tabs on mobile | 1 day | Standard mobile UX pattern |

### 🔵 P3 — Do Next Quarter (Differentiation)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 16 | **Live supplier pricing API** — real-time rates from supplier APIs | 2-4 weeks | Matches Buildxact's strongest feature |
| 17 | **Multi-user + teams** — invite subcontractors, share jobs | 2-3 weeks | Enterprise-grade collaboration |
| 18 | **Native mobile app** (React Native or Capacitor wrapper) | 4-6 weeks | App store presence |
| 19 | **TypeScript migration** — gradual, file-by-file | 2-3 weeks | Long-term maintainability |
| 20 | **E2E tests** (Playwright) for critical paths | 1 week | CI confidence |

---

## 8. RECOMMENDED IMMEDIATE ACTIONS

If you do nothing else this week, do these three things:

1. **Add error boundaries** — wrap the estimator and CM in `<ErrorBoundary>` components. Takes 2 hours. Prevents the blank-screen-of-death that will lose you users.

2. **Add rate limiting to `/api/ai/chat`** — a simple in-memory counter (10 requests per IP per minute) prevents someone from running up your Anthropic bill. Takes 1 hour.

3. **Write 5 estimator tests** — feed `Estimator.buildEstimate()` a known spec and assert the total is within ±5% of expected. Takes 2 hours. Catches regressions before they ship.

These three changes take half a day and address the three highest-risk items in the entire codebase.

---

*Detailed sub-reports from the UX/performance and code quality auditors are available in `audit/ux-and-performance.md` and `audit/code-quality.md`.*
