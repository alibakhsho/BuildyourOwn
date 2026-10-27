/* =========================================================================
   MODULE: modules/Integrations.jsx
   Connect BuildYourOwn to Xero or MYOB.

   Each builder signs up with BuildYourOwn, then links their OWN Xero
   organisation or MYOB company file (one click, the provider's own consent
   screen). Signed out, the panel says so instead of offering a button that
   can't work.

   Three states per provider, and the UI has to be honest about which one
   the builder is in, because the fix differs:
     - not configured : the SERVER has no client ID/secret. Only whoever
                        deploys this can fix it, so we say so explicitly
                        rather than showing a Connect button that 400s.
     - configured     : ready to connect. One button, straight to consent.
     - connected      : shows the organisation and when the link renews.
   ========================================================================= */

import React, { useCallback, useEffect, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { getStatus, startConnect, disconnect } from "../lib/accounting.js";

export default function Integrations({ compact = false }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    getStatus()
      .then((s) => { setStatus(s); setError(""); })
      .catch((e) => setError(e.message));
  }, []);

  // Reload on focus: the OAuth round trip finishes in this tab (or another),
  // so returning to the page is the natural moment to re-check.
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const onDisconnect = async (provider) => {
    if (!confirm(`Disconnect ${provider === "xero" ? "Xero" : "MYOB"}? Nothing already pushed is affected.`)) return;
    setBusy(provider);
    try {
      await disconnect(provider);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const onConnect = async (provider) => {
    setBusy(provider);
    setError("");
    try {
      await startConnect(provider);   // navigates away on success
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };

  const signedOut = status && status.perAccount && !status.signedIn;

  return (
    <section style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: "16px 18px", marginBottom: 16 }}>
      <div className="ec-display" style={{ fontSize: 17, marginBottom: 4 }}>Accounting</div>
      <p style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.6, margin: "0 0 14px" }}>
        Push progress claims and purchase orders straight into your accounting file. Everything arrives as a{" "}
        <strong>draft</strong> — nothing is sent to a client or a supplier from here, so you always see it before
        it goes out.
      </p>

      {error && (
        <div style={{ padding: "8px 12px", background: TOKENS.errorWash, border: `1px solid ${TOKENS.alert}`, fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!compact && (
        <ol style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.7 }}>
          <li>Sign in to BuildYourOwn (the same account on your phone and computer).</li>
          <li>Connect Xero or MYOB below and approve it on their screen — you choose which organisation or company file.</li>
          <li>From any job, <strong>Push to Xero/MYOB</strong> on a progress claim or purchase order: it lands there as a draft for you to check and send.</li>
        </ol>
      )}

      {signedOut && (
        <div style={{ padding: "8px 12px", background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}`, fontSize: 12, marginBottom: 12 }}>
          Sign in first — the connection belongs to your account, so your claims go to your books and nobody else's.
        </div>
      )}

      {!status ? (
        <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>Checking connections…</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {["xero", "myob"].map((id) => (
            <ProviderCard key={id} p={status[id]} busy={busy === id} locked={signedOut}
              onConnect={() => onConnect(id)} onDisconnect={() => onDisconnect(id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProviderCard({ p, busy, locked, onConnect, onDisconnect }) {
  if (!p) return null;
  const tone = p.connected ? TOKENS.ok : p.configured ? TOKENS.rule : TOKENS.hivisDeep;

  return (
    <div style={{ border: `1px solid ${tone}`, background: TOKENS.paperLight, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="ec-display" style={{ fontSize: 17 }}>{p.label}</span>
        <span className="ec-mono" style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, padding: "2px 7px",
          background: p.connected ? TOKENS.ok : p.configured ? TOKENS.rule : TOKENS.hivis,
          color: p.connected ? TOKENS.card : TOKENS.onHivis }}>
          {p.connected ? "CONNECTED" : p.configured ? "READY" : "NOT SET UP"}
        </span>
        <span style={{ flex: 1 }} />
        {p.connected ? (
          <button className="ec-mono" onClick={onDisconnect} disabled={busy}
            style={{ padding: "5px 12px", fontSize: 10, fontWeight: 700, border: `1px solid ${TOKENS.alert}`, background: "transparent", color: TOKENS.alert, cursor: "pointer" }}>
            {busy ? "…" : "Disconnect"}
          </button>
        ) : p.configured ? (
          <button className="ec-btn ec-btn-hivis" style={{ fontSize: 12, padding: "6px 14px" }} onClick={onConnect} disabled={busy || locked}>
            {busy ? "Opening…" : `Connect ${p.label}`}
          </button>
        ) : null}
      </div>

      {p.connected && (
        <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 6 }}>
          {p.organisation || "organisation unknown"}
          {p.connectedAt ? ` · linked ${new Date(p.connectedAt).toLocaleDateString()}` : ""}
        </div>
      )}

      {!p.configured && <SetupHelp provider={p.provider} />}
    </div>
  );
}

/** Shown only when the server lacks credentials — the one thing the builder cannot fix from the UI. */
function SetupHelp({ provider }) {
  const isXero = provider === "xero";
  return (
    <div style={{ marginTop: 8, fontSize: 11, color: TOKENS.inkSoft, lineHeight: 1.65 }}>
      <p style={{ margin: "0 0 6px" }}>
        This needs to be set up on the server before it can be connected:
      </p>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          Register an app at{" "}
          <strong>{isXero ? "developer.xero.com/app/manage" : "my.myob.com.au → Developer"}</strong>
        </li>
        <li>
          Set its redirect URI to{" "}
          <code style={{ background: TOKENS.card, padding: "1px 4px" }}>
            &lt;your backend URL&gt;/api/accounting/{provider}/callback
          </code>
        </li>
        <li>
          Put <code style={{ background: TOKENS.card, padding: "1px 4px" }}>{isXero ? "XERO" : "MYOB"}_CLIENT_ID</code>,{" "}
          <code style={{ background: TOKENS.card, padding: "1px 4px" }}>{isXero ? "XERO" : "MYOB"}_CLIENT_SECRET</code>,{" "}
          <code style={{ background: TOKENS.card, padding: "1px 4px" }}>BYO_PUBLIC_URL</code> and{" "}
          <code style={{ background: TOKENS.card, padding: "1px 4px" }}>ACCOUNTING_TOKEN_KEY</code> in the Vercel environment variables (or{" "}
          <code style={{ background: TOKENS.card, padding: "1px 4px" }}>server/.env</code> locally), then redeploy
        </li>
      </ol>
      <p style={{ margin: "6px 0 0", color: TOKENS.steel }}>
        Both providers refuse plain <code>localhost</code> redirects — use a tunnel (ngrok, cloudflared) while
        developing. See <code>server/.env.example</code> for the full list of settings.
      </p>
    </div>
  );
}

/**
 * A one-line prompt on the Site Office dashboard for a signed-in builder
 * who hasn't linked their books yet. Dismissable (remembered per browser);
 * silent whenever it can't help — signed out, nothing set up on the server,
 * already connected, or the status check failed.
 */
export function AccountingNudge({ onOpen }) {
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("byo.nudge.accounting") === "1"; } catch { return false; } });
  useEffect(() => { if (!hidden) getStatus().then(setStatus, () => setStatus(null)); }, [hidden]);
  if (hidden || !status || (status.perAccount && !status.signedIn)) return null;
  const ready = ["xero", "myob"].filter((k) => status[k]?.configured);
  if (!ready.length || ready.some((k) => status[k]?.connected)) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem("byo.nudge.accounting", "1"); } catch { /* private window */ } };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", marginBottom: 14, background: TOKENS.card, border: `1px solid ${TOKENS.hivis}` }}>
      <span style={{ fontSize: 13, flex: 1, minWidth: 220 }}>
        <strong>Connect {ready.map((k) => status[k].label).join(" or ")}</strong> — progress claims and purchase orders go straight into your books as drafts.
      </span>
      <button className="ec-btn ec-btn-hivis" style={{ fontSize: 12, padding: "6px 14px" }} onClick={onOpen}>Connect</button>
      <button onClick={dismiss} aria-label="Dismiss" style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 15 }}>×</button>
    </div>
  );
}
