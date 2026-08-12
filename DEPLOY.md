# Deploying BuildYourOwn

The app is hosted on **Vercel**, connected to the `main` branch of this repo.
Every push to `main` auto-deploys. GitHub stores the code; Vercel runs the site.

Live: https://buildyour-own.vercel.app

---

## 1. Environment variables (Vercel → Settings → Environment Variables)

Add each as a separate entry. Tick **Production, Preview and Development**.

| Key | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase → Settings → API → **anon/public** key. NOT service_role. |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Add only after the credit cap below is set. Powers AI. |

Optional:

| Key | Value | Effect |
|---|---|---|
| `BYO_AI_ENABLED` | `false` | Kill switch — turns AI off instantly without removing the key. |
| `BYO_ALLOWED_ORIGINS` | `buildyour-own.vercel.app` | Locks the AI routes to your domain. |
| `BYO_AI_MODEL` | `claude-opus-5` | Overrides the default model. |

**`VITE_` vars are baked in at build time.** After adding or changing any,
you must **redeploy** (Vercel → Deployments → ⋯ → Redeploy). A refresh alone
does nothing.

**How to confirm Supabase connected:** open the live site, click into the app,
and look for a **"Save your work"** button in the top bar. Present = the env
vars reached the build.

---

## 2. Database (Supabase → SQL Editor)

Run the migration once:

`supabase/migrations/20260806000000_auth_profiles_and_tiers.sql`

It is **idempotent** — safe to run repeatedly. It creates the `profiles`
table, the signup trigger, RLS policies and the column grants that stop a
user from editing their own `tier`. Success shows *"Success. No rows returned"*.

Confirm: Supabase → Table Editor → a `profiles` table exists. Sign up on the
live site with your own email, and a row for you appears with `tier: free`.

---

## 3. Cap AI spend BEFORE the key goes public

The AI endpoints need no login. The only guaranteed ceiling on spend is the
balance on the Anthropic account itself:

- **Anthropic Console → Billing → turn auto-reload OFF**, then top up a small
  amount (e.g. $10). It cannot be charged past that.
- When the balance runs out, AI pauses gracefully — users see *"AI features
  are paused, the estimator/3D/quotes still work"* — and nothing else breaks.

In-app protection already shipped (see `api/_lib/guard.js`): per-IP rate
limits, an origin check, token/prompt/image ceilings, a model allowlist, and
the graceful out-of-credit handling.

---

## 4. Email confirmation (Supabase → Authentication → Providers → Email)

By default Supabase requires email confirmation and its built-in sender is
rate-limited (a few per hour) — fine for testing, a bottleneck at launch.
Before promoting the link publicly, either:

- toggle **"Confirm email" off** for a frictionless signup, or
- connect a real SMTP sender (Supabase → Authentication → Emails).

Also add the live origin under **Authentication → URL Configuration** so
Google sign-in and email links redirect back correctly.

---

## Local development

```bash
npm install
npm run dev:all   # web on :5173, AI backend on :8787
```

Without env vars the app runs entirely on localStorage: no sign-in, and AI
shows a "not configured" message. Everything else works.

`npm test` runs the headless suite; `npm run build` is the production build.
Both run in CI on every push.
