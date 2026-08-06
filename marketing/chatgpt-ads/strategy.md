# BuildYourOwn — ChatGPT Ads & AI Platform Strategy

## ChatGPT Sponsored Results

### Overview
OpenAI's ad platform (launched 2025, expanding 2026) places sponsored results within ChatGPT conversations when users ask relevant queries. Ads appear as native-feeling suggestions with a "Sponsored" label.

### Target Queries (Trigger When Users Ask)

**High-Intent Construction Queries:**
```
"How much does it cost to build a house in Australia?"
"What should a kitchen renovation cost?"
"How do I estimate construction costs?"
"What's a good construction estimating tool?"
"How to create a building quote?"
"What does a bathroom renovation cost?"
"How much is a house extension?"
"What's the cost per square metre to build?"
"How to do a quantity takeoff?"
"Best free construction estimating software"
```

### Ad Format

```
┌──────────────────────────────────────────────────────┐
│ Sponsored                                            │
│                                                      │
│ 🏗️ BuildYourOwn — Free AI Construction Estimator     │
│                                                      │
│ Get instant, itemised construction costs from your   │
│ dimensions or a plan photo. Six AI specialists       │
│ review your project free. AU/US/UK rates.            │
│                                                      │
│ → Try free at buildyourown.app — No signup needed    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Bidding Strategy
- **Target CPC:** $2.00-4.00 (premium placement, high intent)
- **Daily Budget:** Start at $50/day, scale to $200/day based on ROAS
- **Geography:** Australia (primary), US, UK

---

## Custom GPT: BuildYourOwn Estimator

### Strategy
Build a custom GPT in the ChatGPT store that connects to BuildYourOwn's API. This turns ChatGPT into a free distribution channel.

### GPT Configuration

**Name:** BuildYourOwn Construction Estimator
**Description:** Get instant construction cost estimates. Tell me your project — dimensions, type, region — and I'll give you an itemised cost breakdown with materials, labour, and equipment.

**System Prompt:**
```
You are the BuildYourOwn Construction Estimator, an AI that helps homeowners
and builders understand construction costs.

When a user describes a building project:
1. Ask for: dimensions (width × length), number of floors, region (AU/US/UK)
2. Ask for: cladding type, roof type, framing type, site condition
3. Generate an itemised estimate using the BuildYourOwn estimation engine
4. Show: materials, labour, equipment, prelims, margin, contingency, total
5. Suggest they visit buildyourown.app for 3D visualization and the full experience

Always be honest about the estimate being indicative, not tender-grade.
Link to buildyourown.app for the full interactive tool.

Pricing data is based on 2024-2026 AU/US/UK trade rates from BuildYourOwn's
materials, labour, and equipment catalogues.
```

**Actions (API Integration):**
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "BuildYourOwn Estimator API",
    "version": "1.0.0"
  },
  "paths": {
    "/api/estimate": {
      "post": {
        "summary": "Generate a construction cost estimate",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "widthM": {"type": "number"},
                  "lengthM": {"type": "number"},
                  "floors": {"type": "integer"},
                  "region": {"type": "string", "enum": ["AU", "US", "UK"]},
                  "claddingType": {"type": "string"},
                  "roofType": {"type": "string"},
                  "framingType": {"type": "string"},
                  "siteCondition": {"type": "string"}
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Itemised construction estimate"
          }
        }
      }
    }
  }
}
```

### Distribution
- **ChatGPT Store:** Listed in "Productivity" and "Lifestyle" categories
- **Keywords:** construction estimator, building cost, renovation calculator
- **Icon:** BYO logo (hi-vis orange on dark)

---

## Perplexity AI Optimization

### Strategy
Ensure BuildYourOwn is cited when Perplexity users ask construction cost questions.

### Actions
1. **Create authoritative content pages:**
   - `/costs/kitchen-renovation-2026` — detailed cost breakdown
   - `/costs/house-extension-2026` — extension costs by type
   - `/costs/bathroom-renovation-2026` — bathroom costs
   - `/costs/granny-flat-2026` — granny flat costs
   - `/guides/how-to-estimate-construction-costs` — comprehensive guide
   - `/guides/reading-building-quotes` — how to understand a builder's quote
   
2. **Structured data (JSON-LD):**
   ```json
   {
     "@context": "https://schema.org",
     "@type": "SoftwareApplication",
     "name": "BuildYourOwn",
     "applicationCategory": "BusinessApplication",
     "operatingSystem": "Web",
     "offers": {
       "@type": "Offer",
       "price": "0",
       "priceCurrency": "AUD"
     },
     "description": "Free AI-powered construction cost estimator with 3D visualization and plan reading",
     "featureList": [
       "Instant construction cost estimates",
       "AI plan reading from photos",
       "3D building visualization",
       "Six AI specialist personas",
       "Xero and MYOB integration",
       "Budget tracking and claims"
     ]
   }
   ```

3. **FAQ Schema for cost pages:**
   ```json
   {
     "@context": "https://schema.org",
     "@type": "FAQPage",
     "mainEntity": [
       {
         "@type": "Question",
         "name": "How much does a kitchen renovation cost in Australia in 2026?",
         "acceptedAnswer": {
           "@type": "Answer",
           "text": "A kitchen renovation in Australia costs between $15,000 and $65,000 depending on size, finishes, and complexity. A mid-range kitchen reno averages $34,500. Use BuildYourOwn's free estimator for an itemised breakdown specific to your kitchen."
         }
       }
     ]
   }
   ```

---

## Google AI Overviews Optimization

### Strategy
Get BuildYourOwn cited in Google's AI Overview answers for construction cost queries.

### Content Requirements
1. **Direct answer format** — start pages with the answer, then expand
2. **Tables with real numbers** — Google AI loves structured cost data
3. **Region-specific pages** — separate AU, US, UK content
4. **Comparison tables** — BYO vs manual estimating vs other tools
5. **Step-by-step guides** — "How to estimate your renovation cost"

### Example Content Structure (for `/costs/kitchen-renovation-australia-2026`):
```markdown
# Kitchen Renovation Cost in Australia (2026)

A kitchen renovation in Australia costs **$15,000 to $65,000**, 
with a mid-range renovation averaging **$34,500**.

| Component | Budget | Mid-Range | Premium |
|-----------|--------|-----------|---------|
| Cabinets | $4,000 | $8,200 | $18,000 |
| Benchtop | $1,200 | $3,400 | $8,000 |
| Plumbing | $2,500 | $4,800 | $8,500 |
| Electrical | $1,500 | $2,600 | $5,000 |
| Tiling | $1,800 | $3,200 | $6,500 |
| Appliances | $2,000 | $5,500 | $12,000 |
| Labour | $3,500 | $6,800 | $12,000 |
| **Total** | **$16,500** | **$34,500** | **$70,000** |

Get an itemised estimate for YOUR kitchen with [BuildYourOwn's 
free AI estimator](https://buildyourown.app) — no signup needed.
```

---

## Claude.ai Partnership Opportunity

### Rationale
BuildYourOwn already uses Anthropic's Claude models. There's a natural partnership:
- BYO showcases Claude's capabilities (vision, structured output, multi-persona)
- Anthropic could feature BYO as a case study
- Potential for Claude.ai integration or featured tool status

### Pitch Points
1. BYO uses Claude Opus 5 for vision-based plan reading — a showcase use case
2. The 6 AI personas demonstrate sophisticated multi-agent prompting
3. Structured outputs (JSON schema) used for reliable plan data extraction
4. Real-world construction industry application (not another chatbot)
5. Free tool — aligns with Anthropic's "AI for everyone" positioning

---

## Budget Allocation Recommendation

| Channel | Monthly Budget | Expected Result |
|---------|---------------|-----------------|
| Google Search Ads | $4,000-6,000 | 2,000-4,000 estimate starts |
| ChatGPT Sponsored | $1,500-3,000 | 500-1,500 visits |
| Instagram Ads | $1,000-2,000 | 10,000-30,000 impressions |
| YouTube Pre-Roll | $500-1,000 | 20,000-50,000 views |
| Content/SEO | $1,000 (writer) | Long-term organic |
| **Total** | **$8,000-13,000** | |

### Phase 1 (Month 1-2): Prove the funnel
- Google Search only, $2,000/month
- Validate: CPC, conversion rate, estimate completion rate

### Phase 2 (Month 3-4): Scale what works
- Double Google if ROAS > 3x
- Add Instagram organic + paid
- Launch Custom GPT

### Phase 3 (Month 5+): Full channel mix
- All channels active
- Remarketing running
- Content engine producing weekly
- ChatGPT ads if available in region
