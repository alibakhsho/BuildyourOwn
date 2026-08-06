# BYO Subscription Plans

Four tiers, one per audience you named: homeowners, tradies, builders, and
enterprise/developers. Prices in AUD, ex GST, monthly with ~2 months free on
annual. AU-first because that is where the Xero/MYOB story and the AU progress
claim logic actually differentiate us.

## The competitive frame

| Product | Monthly | Aimed at |
|---|---|---|
| Houzz Pro | $89–149 | Small renovators |
| Buildxact | $149–349 | AU residential builders |
| Buildertrend | $199–799 | Mid/large builders |
| **BYO** | **$0–599** | All four segments |

The research is right that free is a strong wedge. But "free is a nuclear
competitive advantage" needs one correction before you price on it: free is a
*customer acquisition* advantage and a *gross margin* problem. Every free
estimate runs an Opus plan-read, and vision calls on a 2576px plan are the most
expensive thing the app does. Free must be metered or it scales your COGS
faster than your revenue. That constraint shapes the tiers below.

---

## Tier 1 — Free ("Homeowner")

**$0** · the wedge, and the top of every funnel

- 3 projects
- **2 AI plan reads per month** ← the actual cost control
- Full 3D visualisation and cost breakdown
- Spreadsheet / SketchUp / CAD import
- Export to PDF, watermarked
- AI crew: 20 messages/month

Homeowners genuinely do not have a recurring job to do — they renovate once
every 7 years. Trying to charge them a subscription fights the use case. Their
value to you is **data and distribution**: they generate the cost data that
makes your benchmarks credible, and they bring you to their builder. Treat free
as a marketing line item, not a failed conversion.

## Tier 2 — Pro ($49/mo) — "Tradie"

**$49/mo** or $490/yr · sole traders, subbies, small renovators

- Unlimited projects
- **25 AI plan reads/month**
- Unlimited AI crew
- Unbranded, white-label quotes with your logo
- Quote → accepted tracking
- Supplier price lookup
- 1 user

The upgrade trigger is the watermark and quote volume — a tradie quoting 5+ jobs
a month cannot send watermarked PDFs to clients. That is the single strongest
conversion lever in the product, so make the watermark tasteful but unmissable.

## Tier 3 — Business ($149/mo) — "Builder"

**$149/mo** or $1,490/yr · 3–20 jobs running at once. Priced deliberately at
Buildxact's *entry* point while including things they charge more for.

- Everything in Pro
- **100 AI plan reads/month**
- **The whole Manage side**: cost centres, POs, variations, progress claims,
  site diary, tasks, docs
- **Xero / MYOB sync**
- AU progress claims done natively (work-to-date → less prior → less retention
  → then GST)
- 5 users, then $25/user/mo
- Job costing: estimated vs committed vs actual

This is your real business. Homeowners are volume, tradies are proof, but
builders are the ones with an expensive recurring problem and an existing
budget line. Everything else in the funnel exists to reach them.

## Tier 4 — Enterprise ($599/mo+) — "Developer"

**From $599/mo**, annual contract · volume builders, developers, commercial

- Everything in Business
- Unlimited users and plan reads (fair-use)
- High-rise elemental cost planning
- **API access + webhooks**
- SSO/SAML
- Custom cost libraries and rate cards
- White-label / custom domain
- Onboarding + a named contact
- 99.9% uptime SLA

Do not self-serve this tier. It should be a conversation, because the real
contract value is usually $1,500–4,000/mo once seats and custom rate cards are
counted, and because these buyers *expect* to negotiate.

---

## Two things I would change about the research's recommendation

**1. The names matter more than the numbers.** The report proposes
Free → Pro → Business → Enterprise, which is generic SaaS. Your segments have
strong professional identities — a tradie knows they are a tradie. Naming the
tiers after the customer instead of the feature set makes the choice
self-evident and cuts your sales explanation to one line.

**2. Meter the plan reads, not the seats.** The instinct with a construction
product is per-seat pricing. But your marginal cost is driven by vision calls,
not logins, so per-seat pricing decouples revenue from cost in exactly the wrong
direction — a 2-user builder doing 400 plan reads is your worst account. Cap
reads per tier, sell overage at ~$2/read, and your margins stay intact at every
scale.

## Rollout order

1. **Ship free with no billing at all.** Get signups and real usage data. You
   cannot price confidently until you know what a typical plan-read volume looks
   like per segment — right now nobody knows, including this document.
2. Add Pro once you see tradies hitting the watermark.
3. Add Business when Xero is actually connected end-to-end.
4. Enterprise stays sales-led indefinitely.

Charging on day one for a product with no signed-up users optimises the wrong
thing. The bottleneck is proving people want it, and free plus a metered cap
tests that without burning margin.
