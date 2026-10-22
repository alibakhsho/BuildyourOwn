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

### Enquiry alerts and the 1.5% fee (built Oct 2026)
- **Alerts:** when a buyer sends an enquiry, the seller gets an email (Reply goes straight to the buyer) and a badge on **Marketplace** in the app. Server route `api/market/notify.js`; one email per enquiry, only triggered by the buyer who sent it, within 15 minutes.
  - Setup: make a [Resend](https://resend.com) account, verify the sending domain (buildyourown.dev), then set on Vercel: `RESEND_API_KEY`, `MARKET_EMAIL_FROM` (e.g. `BuildYourOwn <enquiries@buildyourown.dev>`) and `SUPABASE_SECRET_KEY` (already used by billing). `/api/health` shows whether they're set. Without them, enquiries still arrive in the app; only the email is skipped.
- **Contracts and fees:** a builder records a signed contract from an enquiry (**Contract signed**) or from a won Site Office job (Overview → **Record the signed contract**). The database works out the fee (1.5% ex GST, `contracts.fee_cents`) and the builder sees it under **My marketplace → Fees**. Builders can correct or void a record for 14 days while it's "recorded"; after that it's locked.
  - Staff (Supabase dashboard → `contracts`): set `status` to `invoiced` / `paid`, or change `fee_rate` for a special deal. Billing the fee (Stripe invoice) is the next step.
  - Migration: `supabase/migrations/20261021000000_enquiry_alerts_and_contract_fees.sql` (after the marketplace migration).

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

## 5. Decisions (Oct 2026)
1. **National from launch.** We already have three regions, so no state is left out. The approvals rules already cover all eight states and territories.
2. **We are a platform, not a party to the build.** Builders show their own sample projects in their portfolios. Licensing, insurance, engineering and permits are the builder's responsibility. The Approvals tab is a tool *for the builder* to manage that, not a service we provide.
3. **Revenue: a 1.5% platform fee on every contract signed through BuildYourOwn**, plus subscriptions. No escrow at first; it may come later.
4. **No custom contract templates from us.** Builders use their own contracts. We record the signed contract value and charge the fee.

5. **Approvals:** builders get the full Approvals tab. Homeowners get a free read-only view in the estimator's *Codes & compliance* tab that shows whether their work needs structural sign-off and what the builder will arrange (built).
6. **Builders get a free hand on how they sell** (`src/logic/marketplace.js`):
   - **Buy the plans:** pay in the app and build with anyone (seller confirms they own the design).
   - **Licence to build once:** pay per build.
   - **Build with this builder:** the design is a showcase and comes with a signed build contract.
   - **Prefab module:** a fixed price, paid in the app, *what you see is what you get*. Every listing must answer included/excluded for footings, transport and crane, service connections, and site approvals, so the buyer sees what else to budget for.
   - **Fees on plans and modules: discussed on contract** for now. Only the 1.5% on build contracts is fixed.
7. **No payments in the app yet.** Buyers send an enquiry; Stripe (Connect) checkout comes later, set up from the owner's computer.

### Terms of Use and Privacy Policy (Oct 2026)
- Text in `src/legal/` (terms.js, privacy.js; operator details in company.js), shown at `/?page=terms` and `/?page=privacy`. **Before launch:** fill in `legalName`, `abn` and `contactEmail` in company.js, and set `termsVersion` / `privacyVersion` to that day's date.
- Sellers agree to the Terms (and the fee) before they get a profile; existing sellers are asked once before the seller tools open. Migration `20261022000000_seller_terms_acceptance.sql` records the version and a server-stamped time, keeps it from going backwards, and takes the **Verified** tick off when a seller changes their ABN or licence. Run it before deploying the app code that needs it.
- **Verified** means staff checked the ABN on the ABN Register and the licence on the state register (Terms, "Selling"). Only tick a seller after doing both.
- Prices: homeowners see the AI add-on including GST; Tradie and Builder show + GST with the total. Listing prices are entered and shown including GST. If the business isn't registered for GST, set `GST_RATE = 0` in `src/lib/entitlements.js` and turn off automatic tax in checkout.
- The fee applies only to clients who sent an enquiry through the Marketplace in the 12 months before signing. Site Office asks rather than assumes, and the contract dialog won't record an enquiry that's more than 12 months old.
- Still to do: a scheduled purge of contract records after 7 years; a `verified_on` date; e-mailing sellers 30 days before a Terms change.

### Live now (Oct 2026)
The marketplace is in the app (**Marketplace** in the top bar, and on the landing page) on the live database (`supabase/migrations/20261020100000_marketplace.sql`):
- **Plans & modules:** browse live listings by type, state and name; listing pages with photos, specs, "what's in the price" for prefab, and an enquiry form.
- **Builders & tradies:** directory and public profiles with licence number, work, regions, portfolio and listings.
- **My marketplace:** the seller dashboard. New enquiries, live listings, views and finished jobs at a glance; enquiry inbox with status; listing editor that says what's missing before Publish; portfolio and profile editors; plus "Sent" for buyers.
- **Who can do what (enforced by the database):** anyone browses; Tradie plan (or trial) gets a profile + portfolio; Builder plan gets listings; signed-in users enquire (20 a day). Staff can take a listing down by setting `hidden` in the Supabase dashboard, and mark a profile `verified`.

### Making the 1.5% stick
- The fee is charged when the contract is marked signed on the platform. The builder agrees to it in the platform terms when they sign up.
- The weak point is leakage: a builder meets the client here, then signs off-platform. Make on-platform signing the easy path: e-sign, the client's quote stages and progress claims live here, and portfolio ranking only counts jobs signed here.
- The Terms say plainly that BuildYourOwn is not the builder and is not a party to the contract, and that apart from the ABN and licence check behind the Verified tick we don't check licences, insurance or permits. Each builder's licence number shows on their profile so clients can check it themselves.
