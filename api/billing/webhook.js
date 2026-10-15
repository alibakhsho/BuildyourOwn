/* =========================================================================
   POST /api/billing/webhook — Stripe → us. Renewals, failed payments,
   plan changes and cancellations made in the portal all arrive here.

   1. Verify the signature against the RAW request body
      (STRIPE_WEBHOOK_SECRET). Anything unsigned is rejected.
   2. Take only the customer id from the event, then re-read that customer
      from Stripe (syncCustomer). The payload is never trusted for the plan.
   3. Reply 200 once applied; a 500 makes Stripe retry later.

   Raw body: Vercel parses JSON lazily — touching req.body would consume the
   stream — so this reads the stream itself and never touches req.body. The
   Express dev server mounts this route with express.raw() BEFORE
   express.json() and hands the buffer over as req.byoRawBody.
   ========================================================================= */
import { stripe, syncCustomer, billingConfigured } from "../_lib/billing.js";
import { rpc, serviceHeaders } from "../_lib/supabase-server.js";

export const config = { api: { bodyParser: false } };

/* Events that can change what an account has. Everything else: 200, ignored. */
export const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
]);

async function rawBody(req) {
  if (Buffer.isBuffer(req.byoRawBody)) return req.byoRawBody;
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const buf = Buffer.concat(chunks);
  if (buf.length) return buf;
  // A runtime that buffered the body for us: only usable if still unparsed
  // (a parsed object can't be re-serialised byte-for-byte, so it fails the
  // signature check — safely).
  const b = req.body;
  return Buffer.isBuffer(b) ? b : typeof b === "string" ? Buffer.from(b) : buf;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!billingConfigured() || !secret) return res.status(503).json({ error: "Billing webhook not configured." });

  let event;
  try {
    const body = await rawBody(req);
    event = await stripe().webhooks.constructEventAsync(body, req.headers["stripe-signature"], secret);
  } catch (e) {
    return res.status(400).json({ error: `Webhook signature check failed: ${e.message}` });
  }

  if (!HANDLED.has(event.type)) return res.status(200).json({ received: true, ignored: event.type });

  const obj = event.data?.object || {};
  const customer = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  if (!customer) return res.status(200).json({ received: true, ignored: "no customer" });

  try {
    // A completed Checkout names the account it was started from; make sure
    // the customer is linked to it (first link wins) before syncing.
    let hint;
    if (event.type === "checkout.session.completed" && obj.client_reference_id) {
      hint = obj.client_reference_id;
      await rpc("link_stripe_customer", { p_user: hint, p_customer: customer }, serviceHeaders());
    }
    const out = await syncCustomer(customer, hint);
    return res.status(200).json({ received: true, applied: out.applied, tier: out.tier });
  } catch (e) {
    console.error("[billing webhook]", event.type, e?.message || e);
    return res.status(500).json({ error: "Couldn't apply the change yet; Stripe will retry." });
  }
}
