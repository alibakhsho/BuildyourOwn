# BuildYourOwn — Complete Deployment & Launch Guide
## For First-Time Agent Operators

This is your step-by-step playbook to take everything we've built and deploy it live.

---

## 🏗️ What You Have Right Now

```
BuildYourOwn/
├── src/                    ← The app (LIVE on Vercel ✅)
├── api/                    ← Serverless AI endpoints (LIVE ✅)
├── server/                 ← Local dev Express server
├── marketing/              ← All marketing assets (READY, in git ✅)
│   ├── brand/              ← Positioning, automation playbook
│   ├── instagram/          ← Content strategy + 6 visual post templates
│   ├── google-ads/         ← Ad copy, keywords, strategy
│   ├── chatgpt-ads/        ← ChatGPT/AI platform strategy
│   ├── research/           ← 3 industry research reports (82KB)
│   └── seo/                ← SEO cost pages (kitchen reno)
├── admin-panel/            ← Admin dashboard (gitignored, local only)
└── vercel.json             ← Deployment config
```

**Live URL:** https://buildyour-own.vercel.app/
**Repo:** https://github.com/alibakhsho/BuildyourOwn.git
**Branch:** feature/construction-management

---

## 📋 Deployment Phases

### PHASE 1: Push Marketing Assets to Production (10 minutes)
**What:** Get your marketing research and strategy docs into the repo.
**Why:** They're already committed locally, just need pushing.

```bash
cd C:\Users\great\AI-Projects\BuildyourOwn
git push origin feature/construction-management
```

That's it. The marketing docs are in git but not served by Vercel (they're `.md` files in a folder Vite doesn't bundle). They're for YOUR reference — the strategy playbooks.

---

### PHASE 2: Add SEO Cost Pages to Your App (30 minutes)
**What:** Serve the SEO cost pages from your Vercel domain so Google indexes them.
**Why:** These pages will drive organic traffic when people search "kitchen renovation cost Australia 2026".

**How it works on Vercel:** Add them as static HTML in the `public/` folder:

```bash
# Create public folder for static assets
mkdir -p public/costs

# Copy SEO pages there
cp marketing/seo/kitchen-renovation-australia-2026.html public/costs/kitchen-renovation-australia-2026.html
```

Then update `vercel.json` to route `/costs/*` to these static pages:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/costs/:path*", "destination": "/costs/:path*.html" }
  ]
}
```

**After push + deploy:** https://buildyour-own.vercel.app/costs/kitchen-renovation-australia-2026 will be live.

---

### PHASE 3: Add the Estimate API for Custom GPT (1 hour)
**What:** Create a `/api/estimate` endpoint that the ChatGPT Custom GPT can call.
**Why:** This turns ChatGPT into a free distribution channel — millions of people asking "how much does a reno cost?" get YOUR numbers.

The endpoint goes in `api/estimate.js` (Vercel serverless function):

```javascript
// api/estimate.js — Public estimate API for Custom GPT integration
import { Estimator } from '../src/logic/estimator.js';
// ... (I'll build the full implementation)
```

**After deploy:**
1. Go to https://chat.openai.com/gpts/create
2. Paste the GPT config from `marketing/chatgpt-ads/strategy.md`
3. Add the API action pointing to `https://buildyour-own.vercel.app/api/estimate`
4. Publish to the GPT Store

---

### PHASE 4: Instagram Launch (1-2 hours)
**What:** Set up the Instagram account and start posting.
**Why:** Instagram is where homeowners and tradies spend time browsing renovation content.

**Step-by-step:**

1. **Create the account:**
   - Go to instagram.com → Sign Up
   - Username: `buildyourown.ai` (or `buildyourown_app` if taken)
   - Switch to Business Account (Settings → Account → Switch to Professional)
   - Category: "Software" or "Construction Company"

2. **Set up the profile:**
   - Bio: Copy from `marketing/instagram/content-strategy.md`
   - Profile pic: Screenshot the BYO logo from your app
   - Link: https://buildyour-own.vercel.app/
   - Highlights: Create 5 empty highlights with covers

3. **Create your first posts:**
   - Open each `.html` file in `marketing/instagram/posts/` in Chrome
   - Press F12 → Device Toolbar → set to 1080×1080
   - Screenshot (or use Ctrl+Shift+P → "Capture screenshot")
   - Save as PNG
   - Upload to Instagram with captions from the content strategy doc

4. **Schedule future posts:**
   - Sign up for Buffer (free, bufferapp.com) or Later (later.com)
   - Upload your post images
   - Schedule per the calendar in the content strategy

---

### PHASE 5: Google Ads (1 hour setup, then ongoing)
**What:** Start running search ads targeting people looking for construction costs.
**Why:** High-intent traffic — people actively searching "how much does a kitchen reno cost?"

**Step-by-step:**

1. **Create a Google Ads account:**
   - Go to ads.google.com → Start Now
   - Choose "Expert Mode" (skip the guided setup)
   - Add billing (credit card)

2. **Create Campaign 1: Homeowner Search:**
   - Campaign type: Search
   - Goal: Website traffic
   - Networks: Google Search only (uncheck Display)
   - Locations: Australia (start here, expand later)
   - Budget: $30-50/day to start
   - Keywords: Copy from `marketing/google-ads/ad-copy.md` → "Exact Match" section
   - Ad copy: Copy from the same file → "Ad 1" responsive search ad
   - Landing page: https://buildyour-own.vercel.app/

3. **Add negative keywords:**
   - Copy the full negative keyword list from the strategy doc
   - Paste into Campaign → Keywords → Negative Keywords

4. **Track conversions:**
   - Add Google Analytics to your app (I can add the tracking code)
   - Set up conversion events: estimate_started, estimate_completed, plan_uploaded

---

### PHASE 6: Admin Panel — Production Deployment (2-3 hours)
**What:** Make the admin panel real — with auth, real data, and a proper backend.
**Why:** You need to see real user analytics, manage support, track growth.

**Architecture:**
```
Option A: Supabase Backend (Recommended for solo founder)
├── Supabase for auth + database (free tier: 500MB, 50K rows)
├── Admin panel at /admin route (protected by Supabase auth)
├── Event tracking via Supabase insert (client-side)
└── Support tickets stored in Supabase

Option B: Firebase Backend
├── Firebase Auth + Firestore
├── Same admin panel, different data layer
└── Free tier: 1GB storage, 50K reads/day

Option C: Keep it simple — Vercel Analytics + Crisp
├── Vercel Analytics (built-in, free tier)
├── Crisp.chat for support (free tier: 2 agents)
├── No custom admin panel needed initially
└── Focus on product, not infrastructure
```

**My recommendation: Option C to start.** You don't need a custom admin panel until you have 100+ users. Use Vercel's built-in analytics and Crisp for support. Build the custom panel when you outgrow those.

---

### PHASE 7: Marketing Automation Agent (ongoing)
**What:** Cron jobs that automate content, monitoring, and reporting.
**Why:** You can't manually post every day and monitor competitors forever.

I can set up these automated agents right now in Hermes:

| Agent | Schedule | What it does |
|-------|----------|--------------|
| **Content Generator** | Weekly Mon 6AM | Generates cost breakdown posts from BYO estimator data |
| **Competitor Monitor** | Weekly Fri | Checks Buildxact/Buildertrend for pricing/feature changes |
| **Site Health Check** | Daily | Pings buildyour-own.vercel.app, alerts if down |
| **Weekly Report** | Weekly Mon 8AM | Summarises your Vercel analytics, IG growth, ad spend |

---

## 🎯 Recommended Launch Order

| Priority | Task | Time | Impact |
|----------|------|------|--------|
| 1️⃣ | Push marketing to git | 5 min | Gets docs accessible |
| 2️⃣ | Set up Instagram + post first 3 images | 1 hour | Brand presence |
| 3️⃣ | Add SEO pages to Vercel | 30 min | Organic traffic starts |
| 4️⃣ | Add Vercel Analytics + Crisp chat | 20 min | See users, handle support |
| 5️⃣ | Google Ads (AU market first) | 1 hour | Paid traffic |
| 6️⃣ | Build + publish Custom GPT | 1 hour | Free distribution |
| 7️⃣ | Set up marketing automation cron jobs | 30 min | Autopilot |
| 8️⃣ | Admin panel with real backend | Later | When you have users |

---

## 🔑 Accounts You'll Need

| Service | URL | Cost | Purpose |
|---------|-----|------|---------|
| Instagram | instagram.com | Free | Social presence |
| Buffer or Later | buffer.com | Free tier | Post scheduling |
| Google Ads | ads.google.com | $30-50/day | Search ads |
| Google Analytics | analytics.google.com | Free | Traffic tracking |
| Crisp | crisp.chat | Free (2 agents) | Live chat support |
| ChatGPT | chat.openai.com | Free (GPT store) | Custom GPT |
| Canva | canva.com | Free tier | Quick graphics |

---

## 💡 What "Deploying an Agent" Means

Since you mentioned this is your first time — here's the plain English:

**An "agent" in this context is just automated work that runs on a schedule.**

What we built isn't a separate AI product you need to host. It's:

1. **Your app** (already deployed on Vercel) — this is the product
2. **Marketing content** (docs + images) — you post these to Instagram/Google
3. **Strategy docs** (research + playbooks) — your roadmap
4. **Admin panel** (HTML file) — a dashboard to monitor everything
5. **Cron jobs** (Hermes automation) — tasks that run automatically

The "agent" is Hermes (me) running scheduled tasks for you:
- Generating content weekly
- Monitoring your site
- Checking competitors
- Sending you reports

You don't need to deploy the agent separately. It runs here, in Hermes.
