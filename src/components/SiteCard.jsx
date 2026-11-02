/* =========================================================================
   SiteCard — "Your land": find the address, and the estimate gets the real
   block under it.

     address  → a point (Google Geocoding, or OpenStreetMap without a key)
     point    → the registered lot: boundary, area, Lot/DP (NSW cadastre),
                and its land zoning (NSW Planning Portal)
     lot      → frontage × depth, which way the street is, an indicative
                fall from a terrain model
     picture  → the satellite photo, laid under the 3D model at true scale

   Everything lands in spec.land; the 3D model reads it (App → engine
   .setSiteImagery), and two buttons hand the lot to the inputs the estimate
   already prices: "Fit the yard to this lot" (Landscaping setbacks) and the
   block type (Site conditions). Nothing is applied without a click.
   ========================================================================= */
import { useState } from "react";
import InputCard from "./ui/InputCard.jsx";
import { colors as TOKENS } from "../design/system.js";
import { lotDims, slopeSamples, classifySlope, setbacksForLot } from "../logic/site.js";
import { searchAddress, lookupLot, lookupElevation, imageryFor } from "../lib/site-client.js";
import { STD } from "../logic/house-geometry.js";
import { landscapeSpec } from "../logic/structure/index.js";

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const compass = (b) => COMPASS[Math.round(((b % 360) + 360) % 360 / 45) % 8];
const SITE_LABEL = { flat: "Flat / good access", sloping: "Sloping / battered", difficult: "Difficult / steep" };
const fact = { display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${TOKENS.rule}` };

export default function SiteCard({ spec, setSpec }) {
  const land = spec.land || null;
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [imgErr, setImgErr] = useState(false);

  const setLand = (patch) => setSpec((s) => ({ ...s, land: patch === null ? null : { ...(s.land || {}), ...patch } }));

  const find = async () => {
    if (q.trim().length < 4 || busy) return;
    setBusy("search"); setErr(""); setResults(null);
    try {
      const r = await searchAddress(q.trim());
      setResults((r.results || []).map((a) => ({ ...a, provider: r.provider })));
      if (!r.results?.length) setErr("No match — try the street number, street and suburb.");
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const pick = async (a) => {
    setBusy("lot"); setErr(""); setResults(null); setImgErr(false);
    try {
      const r = await lookupLot(a.lat, a.lng);
      const lot = r.lot || null;
      let slope = null;
      if (lot) {
        try {
          const e = await lookupElevation(slopeSamples(lot));
          const c = classifySlope(e.elevations, lot);
          if (c) slope = { ...c, source: e.source };
        } catch { /* terrain is a bonus: the lot still stands without it */ }
      }
      setSpec((s) => ({
        ...s,
        land: {
          address: a.label, lat: a.lat, lng: a.lng, state: a.state, suburb: a.suburb, postcode: a.postcode,
          center: lot ? lot.center : [a.lat, a.lng],
          lot, zoning: r.zoning || null, slope, imagery: r.imagery || "esri", note: r.note || "",
          showImagery: true, searchProvider: a.provider,
        },
      }));
      setQ("");
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const dims = land?.lot ? lotDims(land.lot) : null;
  const img = land ? imageryFor(land) : null;
  const houseW = (spec.widthM || 0) + (spec.hasGarage ? STD.garage.w : 0);
  const fit = dims ? setbacksForLot(dims, houseW, spec.lengthM || 0, landscapeSpec(spec)) : null;

  const turnStreet = () => setLand({ lot: { ...land.lot, streetSide: ((land.lot.streetSide ?? 0) + 1) % 4 } });
  const fitYard = () => setSpec((s) => ({ ...s, landscape: { ...(s.landscape || {}), enabled: true, ...fit.patch } }));
  const useSlope = () => setSpec((s) => ({ ...s, siteCondition: land.slope.suggest }));

  const badge = land ? (land.lot ? `${land.lot.areaM2.toLocaleString("en-AU")} m²` : "Located") : "Add address";

  return (
    <InputCard title="Your land — address & satellite" badge={badge} defaultOpen={!land}>
      {!land && (
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
          Type the address. We'll pull the real block — its boundary and size from the land register, zoning, how much it falls — and lay the satellite photo under your 3D model.
        </p>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input className="ec-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") find(); }}
          placeholder={land ? "Search another address…" : "e.g. 12 Smith St, Parramatta NSW"} aria-label="Address" style={{ flex: 1 }} />
        <button className="ec-btn ec-btn-hivis" onClick={find} disabled={!!busy || q.trim().length < 4}>{busy === "search" ? "…" : "Find"}</button>
      </div>
      {busy === "lot" && <div className="ec-mono" style={{ fontSize: 11, marginTop: 8, color: TOKENS.steel }}>Looking up the lot, zoning and terrain…</div>}
      {err && <div className="ec-mono" style={{ fontSize: 11, marginTop: 8, color: TOKENS.alert, lineHeight: 1.45 }}>{err}</div>}
      {results?.length > 0 && (
        <div role="listbox" aria-label="Matching addresses" style={{ marginTop: 6, border: `1px solid ${TOKENS.rule}`, borderRadius: 8, overflow: "hidden" }}>
          {results.map((a, i) => (
            <button key={i} role="option" aria-selected="false" onClick={() => pick(a)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderTop: i ? `1px solid ${TOKENS.rule}` : "none", background: TOKENS.card, color: TOKENS.ink, font: "inherit", fontSize: 12, cursor: "pointer" }}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {land && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{land.address}</div>

          {img && (
            <div style={{ position: "relative", marginTop: 8, borderRadius: 10, overflow: "hidden", border: `1px solid ${TOKENS.rule}`, aspectRatio: "1 / 1", background: TOKENS.paperLight }}>
              {!imgErr ? (
                <img src={img.url} alt={`Satellite photo of ${land.address}`} onError={() => setImgErr(true)} loading="lazy"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div className="ec-mono" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 11, color: TOKENS.steel, padding: 16, textAlign: "center" }}>
                  The satellite photo didn't load. The lot details below still apply.
                </div>
              )}
              {land.lot && (
                <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                  <polygon points={land.lot.boundary.map(([x, y]) => `${50 + (x / img.spanM) * 100},${50 - (y / img.spanM) * 100}`).join(" ")}
                    fill="rgba(245,197,24,0.12)" stroke="#F5C518" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
                  {dims && (() => {
                    const b = (dims.streetBearing * Math.PI) / 180, r = Math.min(46, (dims.depthM / 2 / img.spanM) * 100 + 7);
                    const x = 50 + Math.sin(b) * r, y = 50 - Math.cos(b) * r;
                    return <g><circle cx={x} cy={y} r="2.2" fill="#F5C518" /><text x={x} y={y - 3.4} fontSize="3.6" textAnchor="middle" fill="#fff" stroke="#000" strokeWidth="0.25" paintOrder="stroke">street</text></g>;
                  })()}
                </svg>
              )}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            {land.lot ? (<>
              {land.lot.label && <div style={fact}><span style={{ color: TOKENS.steel }}>Title</span><span className="ec-mono">{land.lot.label}</span></div>}
              <div style={fact}><span style={{ color: TOKENS.steel }}>Lot area</span>
                <span className="ec-mono">{land.lot.areaM2.toLocaleString("en-AU")} m² measured{land.lot.registeredM2 ? ` · ${Math.round(land.lot.registeredM2).toLocaleString("en-AU")} m² registered` : ""}</span></div>
              {dims && <div style={fact}><span style={{ color: TOKENS.steel }}>Frontage × depth</span>
                <span className="ec-mono">{dims.frontageM.toFixed(1)} × {dims.depthM.toFixed(1)} m · street to the {compass(dims.streetBearing)}</span></div>}
            </>) : (
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, lineHeight: 1.45 }}>{land.note || "No lot boundary for this address."}</div>
            )}
            {land.zoning && <div style={fact}><span style={{ color: TOKENS.steel }}>Zoning</span>
              <span><strong>{land.zoning.code}</strong> {land.zoning.name}{land.zoning.instrument ? <span style={{ display: "block", fontSize: 11, color: TOKENS.steel }}>{land.zoning.instrument}</span> : null}</span></div>}
            {land.slope && <div style={fact}><span style={{ color: TOKENS.steel }}>Fall</span>
              <span>≈ {land.slope.fallM} m ({land.slope.gradePct}%) {land.slope.toward} — reads as <strong>{SITE_LABEL[land.slope.suggest]}</strong>
                <span style={{ display: "block", fontSize: 11, color: TOKENS.steel }}>{land.slope.source} — a hint only; a contour survey sets the real levels.</span></span></div>}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {land.lot && <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} onClick={turnStreet} title="If the street is on a different side of the block">Turn street side ↻</button>}
            {fit && <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} onClick={fitYard}>Fit the yard to this lot</button>}
            {land.slope && spec.siteCondition !== land.slope.suggest && (
              <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} onClick={useSlope}>Set block type: {SITE_LABEL[land.slope.suggest]}</button>
            )}
            <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} aria-pressed={land.showImagery !== false}
              onClick={() => setLand({ showImagery: land.showImagery === false })}>
              {land.showImagery === false ? "Show satellite in 3D" : "Hide satellite in 3D"}
            </button>
            <button className="ec-btn ec-btn-ghost ec-btn-danger" style={{ fontSize: 12 }} onClick={() => setLand(null)}>Remove</button>
          </div>
          {fit && !fit.fits && <div className="ec-mono" style={{ fontSize: 11, marginTop: 6, color: TOKENS.alert, lineHeight: 1.45 }}>{fit.note}</div>}

          <div className="ec-mono" style={{ fontSize: 10, marginTop: 10, color: TOKENS.steel, lineHeight: 1.5 }}>
            {land.imagery === "google" ? "Imagery © Google" : "Imagery © Esri, Maxar, Earthstar Geographics"}
            {land.lot?.source ? ` · Lot © ${land.lot.source}` : ""}
            {land.zoning ? " · Zoning © NSW Department of Planning" : ""}
            {land.searchProvider === "osm" ? " · Address © OpenStreetMap contributors" : ""}.
            {" "}Boundaries are the register's, not a survey — your surveyor pegs the real ones.
          </div>
        </div>
      )}
    </InputCard>
  );
}
