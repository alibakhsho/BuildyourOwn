/* Vercel serverless health check — GET /api/health → { ok, hasKey, billing }.
   Lets you confirm the deployment picked up its env vars without ever
   exposing a value: only whether each is set (and, for Stripe, whether the
   key is a test or live one). Mirrors server/index.js's /api/health. */
const set = (k) => !!(process.env[k] && process.env[k].trim());

/* Which kind of Stripe key is configured — the prefix only, never the key. */
export function stripeKeyKind(raw = "") {
  const k = raw.trim();
  if (!k) return "missing";
  if (/^(sk|rk)_test_/.test(k)) return "test";
  if (/^(sk|rk)_live_/.test(k)) return "live";
  if (/^pk_/.test(k)) return "publishable key — needs the SECRET key (sk_…)";
  return "unrecognised";
}

export function healthReport() {
  return {
    ok: true,
    hasKey: set("ANTHROPIC_API_KEY"),
    billing: {
      stripeKey: stripeKeyKind(process.env.STRIPE_SECRET_KEY || ""),
      supabaseSecretKey: set("SUPABASE_SECRET_KEY") || set("SUPABASE_SERVICE_ROLE_KEY"),
      webhookSecret: set("STRIPE_WEBHOOK_SECRET"),
    },
  };
}

export default function handler(_req, res) {
  res.status(200).json(healthReport());
}
