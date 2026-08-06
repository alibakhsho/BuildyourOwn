# BuildYourOwn — Marketing Automation & Growth Playbook

## Automated Marketing Engine

### 1. Content Automation Pipeline

#### Instagram Autopilot
```
Schedule:
├── Mon 7:00 AM AEST — Cost Breakdown carousel (auto-generated from BYO estimate data)
├── Tue 7:00 AM — Feature demo Reel (pre-recorded library, scheduled via Later/Buffer)
├── Wed 12:00 PM — Tradie tip (content library, rotated)
├── Thu 7:00 AM — Before/After showcase (user submissions)
├── Fri 6:00 PM — AI Crew spotlight (6-week rotation)
├── Sat 9:00 AM — Weekend project cost (auto-generated)
└── Sun 6:00 PM — Industry insight (curated)

Tools:
- Buffer/Later for scheduling
- Canva API for template-based image generation
- BYO API for real cost data in posts
```

#### Auto-Generated Cost Content
The app already has real cost data. Automate content creation:

```javascript
// Example: Auto-generate Instagram cost breakdown from BYO estimator
async function generateCostPost(projectType, region) {
  const estimate = await runEstimate({
    type: projectType, // 'kitchen', 'bathroom', 'extension', 'deck'
    region: region,    // 'AU', 'US', 'UK'
    preset: 'mid-range'
  });
  
  return {
    title: `${projectType} Renovation Cost (${region}) — ${new Date().getFullYear()}`,
    items: estimate.materialLines.slice(0, 7).map(l => ({
      label: l.label,
      cost: l.total
    })),
    total: estimate.total,
    cta: 'Get YOUR estimate free → link in bio'
  };
}
```

### 2. User Lifecycle Automation

#### Stage 1: First Visit → First Estimate
```
Trigger: User lands on site
Actions:
├── Show "Start in 60 seconds" prompt after 5s idle
├── Auto-detect region from IP → set AU/US/UK rates
├── If mobile: suggest "Tap dimensions, not typing"
└── Track: time_to_first_estimate event
```

#### Stage 2: Estimate Complete → Engagement
```
Trigger: User completes first estimate
Actions:
├── Show "Meet your AI crew" prompt with persona cards
├── Suggest "Try the plan reader" if they haven't
├── Offer "Download this estimate as PDF" (email capture)
├── Track: estimate_complete, build_mode, region, total
```

#### Stage 3: Repeat User → Power User
```
Trigger: User returns or creates 2nd project
Actions:
├── Show "Manage this build" prompt → Construction Manager
├── Suggest Xero/MYOB connection
├── Enable "Compare estimates" feature
└── Track: projects_count, return_visits
```

#### Stage 4: Builder/Tradie → Professional
```
Trigger: User connects Xero/MYOB or creates 5+ jobs
Actions:
├── Unlock pro features (bulk takeoff, team sharing)
├── Show "Import from spreadsheet" if they haven't
├── Suggest AI plan reader for all new jobs
└── Track: accounting_connected, jobs_active
```

### 3. Support Automation

#### Auto-Response System
```yaml
# Canned responses by category
responses:
  greeting:
    - "Hi! 👋 BuildYourOwn support here. How can we help?"
    
  cost_question:
    - "Great question! You can get an instant estimate at buildyourown.app — 
       just type your dimensions. It's free and doesn't need a login."
    
  accuracy:
    - "Our estimates use real 2026 trade rates for AU, US, and UK. 
       They're indicative — great for budgeting and comparing quotes, 
       but always get a builder's quote for the final number."
    
  plan_reader:
    - "The AI plan reader works with photos and scans of building plans. 
       For best results: shoot flat and square-on, and calibrate against 
       the longest figured dimension on the drawing."
    
  accounting:
    - "Xero and MYOB integration pushes POs and claims as drafts — 
       nothing goes to a client or supplier without your review. 
       You'll need a developer app at each provider. 
       See server/.env.example for setup."
    
  bug_report:
    - "Thanks for reporting this! Can you share: 
       1) What you were doing, 
       2) What happened vs what you expected, 
       3) Your browser and device? 
       We'll look into it."
```

#### AI Ticket Categorization
```javascript
// Auto-categorize support tickets using Claude
async function categorizeTicket(subject, body) {
  const response = await aiChat({
    tier: 'fast', // Haiku — cheap and fast
    system: `Categorize this support ticket for a construction estimating app.
      Categories: bug, feature_request, billing, how_to, accuracy_question, 
      integration, general. Also assign priority: low, medium, high, critical.
      Return JSON: {"category": "...", "priority": "...", "suggested_response": "..."}`,
    message: `Subject: ${subject}\n\nBody: ${body}`
  });
  return JSON.parse(response);
}
```

#### Escalation Rules
```yaml
escalation:
  critical:
    trigger: "priority = critical OR keyword in ['data loss', 'security', 'payment', 'crash']"
    action: "Notify admin immediately via Slack/email"
    sla: "1 hour response"
    
  high:
    trigger: "priority = high OR no_response_48h"
    action: "Escalate to senior support"
    sla: "4 hour response"
    
  medium:
    trigger: "priority = medium"
    action: "Queue for next business day"
    sla: "24 hour response"
    
  low:
    trigger: "priority = low"
    action: "Auto-respond with relevant FAQ link"
    sla: "48 hour response"
```

### 4. Analytics & Reporting Automation

#### Daily Automated Report
```
Schedule: 8:00 AM AEST daily
Content:
├── New estimates: count, by region, by mode
├── AI plan reads: count, success rate
├── AI chat messages: count, by persona
├── New users: count, by source
├── Support tickets: open, resolved, avg response time
├── Revenue metrics: if applicable
└── Anomalies: >20% change from 7-day average

Delivery: Email + Slack + Admin Panel dashboard
```

#### Weekly Marketing Report
```
Schedule: Monday 9:00 AM AEST
Content:
├── Instagram: followers, engagement rate, top post
├── Google Ads: spend, clicks, CPC, conversions
├── Organic search: top queries, impressions, clicks
├── Referral traffic: top sources
├── Funnel: visit → estimate → manage → accounting
└── Recommendations: what to double down on, what to cut

Delivery: Email to marketing team
```

### 5. SEO Automation

#### Auto-Generated Cost Pages
```
Trigger: Monthly (rates update)
Process:
├── Run BYO estimator for each project type × region
├── Generate updated cost page with new numbers
├── Update structured data (FAQ schema, Product schema)
├── Submit updated sitemap to Google Search Console
└── Post cost update to social media

Pages:
├── /costs/kitchen-renovation-australia-2026
├── /costs/kitchen-renovation-usa-2026
├── /costs/kitchen-renovation-uk-2026
├── /costs/bathroom-renovation-australia-2026
├── /costs/house-extension-australia-2026
├── /costs/granny-flat-cost-australia-2026
├── /costs/deck-cost-australia-2026
└── ... (20+ pages per region)
```

### 6. Referral & Viral Mechanics

#### Share Your Estimate
```
Feature: After completing an estimate, offer "Share this estimate"
├── Generates a shareable link with estimate summary
├── Recipient sees: "Ali estimated a kitchen reno at $34,500 — get yours"
├── Recipient can try their own estimate (no signup)
└── Track: shares, share_clicks, share_conversions
```

#### Builder-to-Client Loop
```
Feature: Builder sends estimate to client via BYO
├── Client opens estimate on BYO
├── Client sees 3D model and cost breakdown
├── Client can ask the AI crew questions
├── Client becomes a BYO user
└── Client uses BYO for their next project
```

### 7. Feature Flag System

```javascript
// Feature flags for gradual rollout
const FEATURES = {
  ai_plan_reader: { enabled: true, regions: ['AU', 'US', 'UK'] },
  ai_crew_chat: { enabled: true, tiers: ['free', 'pro'] },
  xero_integration: { enabled: true, tiers: ['pro'] },
  myob_integration: { enabled: true, tiers: ['pro'] },
  team_sharing: { enabled: false, rollout: 0.1 }, // 10% of users
  bulk_takeoff: { enabled: false, rollout: 0.0 }, // not yet
  pdf_export: { enabled: true, tiers: ['free', 'pro'] },
  cost_comparison: { enabled: false, rollout: 0.2 },
};
```

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 P0 | Analytics tracking (events) | 1 day | Foundation for everything |
| 🔴 P0 | Share estimate link | 2 days | Viral growth |
| 🟡 P1 | PDF export (email capture) | 1 day | Lead gen |
| 🟡 P1 | Auto-generated cost pages (SEO) | 3 days | Organic traffic |
| 🟡 P1 | Instagram content calendar + scheduling | 2 days | Brand awareness |
| 🟢 P2 | Custom GPT for ChatGPT store | 1 day | Distribution |
| 🟢 P2 | Support ticket automation | 2 days | Efficiency |
| 🟢 P2 | Weekly report automation | 1 day | Visibility |
| 🔵 P3 | Referral system | 3 days | Growth |
| 🔵 P3 | Builder-to-client sharing | 5 days | Network effect |
