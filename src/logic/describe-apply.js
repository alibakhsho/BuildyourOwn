/* =========================================================================
   MODULE: logic/describe-apply.js
   A reading of "Describe your home" (components/DescribeCard.jsx →
   readDescription) only says WHAT was described. These turn it into priced
   inputs: scope items become quote lines through WallBuilder, and a house
   reading becomes the next residential spec. Used by the full app and the
   phone app, so a description builds the same house in both.
   ========================================================================= */
import { WallBuilder } from "./wall-builder.js";
import { houseSpecFromFeatures, mergeSpecPatch } from "./describe.js";
import { nextId } from "../lib/ids.js";

/** Scope items ("a 20m² merbau deck") → priced quote lines. */
export function scopeToLines(items, region) {
  return (items || []).flatMap((it) => {
    const pr = WallBuilder.getPreset(it.preset);
    if (!pr) return [];
    const opts = pr.dim === "wall"
      ? { lengthM: +it.lengthM || 3, heightM: +it.heightM || 2.4, finish: it.finish || "paint", sides: +it.sides || 2, insulated: true, labour: !!it.labour,
          addonList: (it.addons || []).filter((a) => a && a.id).map((a) => ({ id: a.id, qty: +a.qty || 1 })) }
      : { dim: +it.dim || 0, variant: it.variant || (pr.variants ? pr.variants[0].id : undefined), labour: !!it.labour, addonList: [] };
    return WallBuilder.presetToLines(it.preset, opts, region, nextId);
  });
}

/**
 * Apply a house reading to a spec. A re-description rebuilds the house; a
 * change request ("extend the deck…") only changes what it names.
 * Returns { spec, summary } — summary is one plain line for the person.
 */
export function applyHouseResult(spec, r, region) {
  const extras = scopeToLines(r.extras, region);
  const redescribed = Object.keys(r.features || {}).length > 0;
  const ed = r.edits;
  let next = redescribed ? houseSpecFromFeatures(r.features, spec) : { ...spec };
  if (extras.length) next = { ...next, extras: [...(spec.extras || []), ...extras] };
  if (ed) next = mergeSpecPatch(next, { ...(ed.patch || {}), ...(Object.keys(ed.landscape || {}).length ? { landscape: ed.landscape } : {}) });
  const parts = [];
  if (ed?.said?.length) parts.push(ed.said.join(" "));
  if (redescribed) parts.push("Updated the house.");
  if (extras.length) parts.push(`Added ${extras.length} extra line${extras.length === 1 ? "" : "s"}.`);
  return { spec: next, summary: parts.join(" ") || "Updated the house." };
}
