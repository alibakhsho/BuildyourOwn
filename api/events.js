/* =========================================================================
   Vercel serverless function — lightweight event collector.
   POST /api/events — receives analytics events from the frontend.

   For MVP: logs to Vercel's function logs (visible in the dashboard).
   Later: push to Supabase, BigQuery, or any analytics DB.

   Events arrive via navigator.sendBeacon (fire-and-forget from the browser).
   ========================================================================= */

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    /* Log to Vercel function logs — visible in Vercel Dashboard → Logs */
    console.log(JSON.stringify({
      _type: "byo_event",
      event: event.event,
      props: event,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
      ua: req.headers["user-agent"],
      ts: event.timestamp || new Date().toISOString(),
    }));

    return res.status(204).end();
  } catch {
    return res.status(204).end(); // Never fail — analytics shouldn't break UX
  }
}
