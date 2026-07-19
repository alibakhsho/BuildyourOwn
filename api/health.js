/* Vercel serverless health check — GET /api/health → { ok, hasKey }.
   Lets you confirm the deployment picked up the ANTHROPIC_API_KEY env var
   without ever exposing the key itself. Mirrors server/index.js's /api/health. */
export default function handler(_req, res) {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
  res.status(200).json({ ok: true, hasKey });
}
