# BuildYourOwn → the construction marketplace

**Where we are:** an estimator (homeowner, tradie, builder, developer) plus Site Office for running jobs. The estimate is good, but it's *indicative*: it knows the house, not the ground it sits on.

**Where we're going:** one place where a job goes from idea → final price → approved → built. Every party it needs is already on the platform: engineers, certifiers, suppliers with live prices, tradies with verified licences, and builders selling ready-to-go plans and modules.

The moat is the **quote**. Everyone else in this market is a directory, a quoting tool or a marketplace. We own the moment the price gets fixed, so we decide who supplies it.

---

## 1. From estimate to final quote (built in this branch)

A quote now moves through three stages, shown on every job (**Site Office → job → Approvals**):

| Stage | Meaning | What the client gets |
|---|---|---|
| **Indicative** | Something that can still move the build cost is outstanding (soil test, engineering, BAL, energy rating…). | Estimate + provisional allowances, clearly labelled. |
| **Fixed price** | Every price-affecting report is in and its cost impact entered. | A firm price. The permits still to issue are listed as conditions. |
| **Final / approved** | Every approval has issued. | Ready to sign and start. |

The builder answers six questions about the site: state, type of work, storeys, and the bushfire, flood, heritage and slope overlays. The checklist follows from the rules in `src/logic/approvals.js`:

- **Survey:** contour & detail survey
- **Engineering:** soil test / site class (AS 2870), wind class (AS 4055), structural design (RPEQ in QLD), stormwater, retaining walls, flood
- **Energy:** NatHERS 7-star (NCC 2022), or BASIX in NSW; BAL (AS 3959) on bushfire land
- **Planning:** DA / planning approval when overlays or multi-dwellings trigger it; heritage report
- **Building:** building approval, named per state (QLD certifier, NSW CC/CDC, VIC building surveyor…); plumbing approval
- **Insurance & levies:** home warranty (QBCC, HBCF, DBI…) and portable LSL levies (QLeave, NSW LSC), worked out from the contract value

Each item carries a provisional fee allowance, who provides it, and a **"moves price"** flag. When the engineer's plans arrive, the builder attaches them (PDF, images, DWG) to that item. They're filed in the job's Documents and linked to the approval. The builder then enters the real fee and how much the report moved the build cost. Quote total = estimate + fees + cost impact.

> Statutory thresholds and levy rates are carried as data with a "confirm the current figure" note. They change, and the app says so.

### How the engineer gets their plans in

| Phase | How | Status |
|---|---|---|
| **1. Builder uploads** | Engineer emails plans → builder attaches them to the approval item | ✅ Built (this branch) |
| **2. Invite link** | Builder clicks "Request" → engineer gets a secure link to that one job → uploads plans, fee and cost notes directly → builder is notified | Schema drafted (`docs/marketplace-schema.sql`, `job_shares` + `approval_submissions`) |
| **3. Engineer marketplace** | Builder or homeowner picks an engineer, certifier or energy assessor from the directory, sees fee and turnaround, books and pays in-app | Phase 3 below |

Phase 2 needs jobs in the cloud (today Site Office data lives on the device; estimator projects already sync). That's the next build step.

### Still needed for a truly final quote
- **Price validity.** A fixed quote must say how long it holds. Live supplier prices carry `validUntil`; the quote's validity is the earliest expiry (`quoteValidUntil`).
- **Exclusions & PC/PS items.** Prime-cost and provisional-sum schedules printed on the quote (fittings, rock excavation…).
- **Contract.** Generate the state's standard residential contract (HIA/MBA style, or our own reviewed by a construction lawyer), e-signed, with the deposit capped at the state limit.
- **Quote PDF** with stage, conditions, validity and the engineer's documents appended.

---

## 2. Partnership readiness: live pricing and tradies on demand (contracts built)

Partners will ask "what do you need from us?". The answer is now code: `src/partners/contracts.js`, documented for them in `docs/PARTNER-API.md`.

**Live pricing (suppliers):** `PriceQuote` = SKU, unit, integer cents ex GST, region, minimum quantity, lead time, stock, delivery, **validUntil**. We never use a price without an expiry. `bestPrice()` picks the cheapest *landed* price (unit × qty + delivery) that's valid, in the region and above the minimum quantity.

**Tradies on demand (dispatch partners):** `TradeOffer` = trade, ABN, licence (number, state, expiry), public liability, service postcodes, rate, availability. `dispatchEligibility()` refuses anyone with an expired licence or insurance, an interstate licence, under A$5m public liability, or out of area, and says why.

**Registry:** `registerPartner()` / `livePrices()` / `availableTrades()`. Every partner is queried in parallel; one partner failing or sending junk never breaks the quote.

### Before the first partner call
1. **Server-side adapters.** Partner API keys live on the server (like the Anthropic and Stripe keys now), never in the browser. Add `api/partners/prices.js` and `api/partners/trades.js`.
2. **SKU mapping.** Map partner SKUs to our `materials.js` catalogue ids (`catalogueId`). This is the real work of every pricing deal; build a mapping tool.
3. **Licence verification.** Check against the state registers (QBCC licence search, NSW Fair Trading, VBA…) rather than trusting the partner. Store `verified_at` server-side only.
4. **Commercials.** Referral fee per accepted quote line, or a margin on marketplace orders through **Stripe Connect** (we already run Stripe).
5. **Data terms.** A partner agreement covering price display, caching (no longer than `validUntil`), attribution and privacy (Privacy Act / APPs).

Target partners to approach: national trade suppliers (frames & trusses, roofing, plumbing), regional yards (FNQ first: we already list them), equipment hire, trades platforms, home-warranty insurers, construction lenders.

---

## 3. The marketplace: going all in

Four sides, one job record connecting them:

| Side | What they list | What they get |
|---|---|---|
| **Suppliers** | Materials with live prices, **exclusive lines** only sold here | Orders straight from fixed quotes |
| **Tradies** | Profile + **portfolio of finished jobs** (photos, suburb, trade, verified via the job) | Work dispatched from quotes that are already won |
| **Builders & designers** | **Ready-to-go plans and modules**: house designs, granny flats, decks, kit/prefab modules, pre-engineered where possible | Sales of plans + builds quoted on them |
| **Engineers / certifiers / assessors** | Services with fixed fees and turnaround by job type | Work from the approvals checklist on every job |

**The flywheel:** a homeowner picks a ready-to-go plan → the estimate is instant because the plan is already modelled → the approvals checklist books the engineer → live prices fix the materials → verified tradies are dispatched → the finished job becomes portfolio content → the next homeowner picks that plan.

**Ready-to-go plans** are the strongest wedge. A plan listed with its 3D model, structure model, cut list and engineering already done skips most of the indicative stage. Its quote can be *fixed* on day one, with only the site items (soil, survey, permits) outstanding.

### Revenue
- Subscriptions (live: Homeowner / Tradie / Builder)
- Marketplace take rate on materials and plan sales (Stripe Connect)
- Lead / dispatch fee per accepted tradie job
- Fixed-fee professional services booking fee
- Featured listings for suppliers and plans
- Later: construction finance and warranty insurance referrals

### Trust and compliance (non-negotiable)
- Licence and insurance verification with expiry monitoring (automatic delisting)
- Reviews only from verified completed jobs
- Payments held in escrow against milestones (Stripe Connect), never beyond the statutory deposit limits
- Australian Consumer Law: clear pricing, no misleading "final" labels (hence the three stages)
- Plan listings: copyright confirmation from the seller; engineering only valid for the site it was done for
- Moderation queue: listings go `pending_review → live` only by staff (enforced in the database)

---

## 4. Roadmap

| Phase | Scope | Builds on |
|---|---|---|
| **0 ✅** | Approvals checklist, quote stages, document attach, partner data contracts + tests | This branch |
| **1** | Site Office jobs sync to the cloud · Quote PDF with stage/conditions/validity · Request button emails the provider | `cloud-sync.js` |
| **2** | Engineer/certifier invite links (`job_shares`, `approval_submissions`, private storage bucket) · notifications | Schema draft |
| **3** | Public pro profiles + portfolios · directory search by trade and postcode · licence verification job | `pro_profiles`, `portfolio_items` |
| **4** | Listings: plans & modules first, then materials · Stripe Connect payouts · moderation | `listings` |
| **5** | First live pricing partner (one regional yard) · SKU mapping tool · price validity on quotes | `contracts.js` |
| **6** | Tradie dispatch partner · escrow milestones · reviews from completed jobs | `contracts.js` |

## 5. Decisions needed from you
1. **First market:** FNQ / QLD only to start (fewer rules to get right, local supplier relationships) or national from day one?
2. **Who uploads first:** do homeowners get the approvals checklist too, or Builder plan only?
3. **Plans marketplace:** sell plans outright, licence per build, or both?
4. **Payments:** take payments and hold escrow ourselves (more revenue, more licensing and compliance) or referral fees only at first?
5. **Legal review:** budget for a construction lawyer on the contract templates and the "fixed price" wording before launch.
