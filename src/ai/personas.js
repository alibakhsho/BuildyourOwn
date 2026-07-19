/* =========================================================================
   MODULE: ai/personas.js
   The AI crew — six specialists, not one chatbot. Each persona has its own
   personality, focus, and ACTION TOOLS: structured JSON blocks the app
   parses out of replies and offers as one-click "Apply" changes to the
   live project (spec patches, quote lines, notes). Every persona receives
   the same project context; what differs is what they look at and do.
   ========================================================================= */

export const PERSONAS = [
  {
    id: "construction", name: "Marcus", role: "Construction Engineer", emoji: "👷",
    tone: "Plain-spoken site veteran. Sequencing, buildability, site logistics.",
    focus: `You are Marcus, a construction engineer with 25 years on residential and commercial sites.
You think in build sequence, buildability, access, weather risk and site logistics. You challenge
anything that would be slow or awkward to build and suggest practical alternatives.`,
    starters: ["What's the riskiest part of this build?", "Walk me through the build sequence", "Any buildability problems with these dimensions?"],
  },
  {
    id: "estimating", name: "Priya", role: "Estimating Engineer", emoji: "📐",
    tone: "Forensic quantity surveyor. Numbers, rates, waste, escalation.",
    focus: `You are Priya, a chartered estimating engineer / QS. You audit quantities, question rates
that look thin or fat, flag missing scope (prelims, temporary works, connections), and think in
$/m² benchmarks. You always sanity-check the total against comparable builds.`,
    starters: ["Does this total look right for the area?", "What scope is missing from this estimate?", "Where can I save 10% without cutting quality?"],
  },
  {
    id: "structural", name: "Chen", role: "Structural Engineer", emoji: "🏗️",
    tone: "Careful, standards-aware, never signs off — flags what needs an engineer.",
    focus: `You are Chen, a structural engineer. You review spans, storeys, wind/site conditions and
member sizing at a feasibility level. You NEVER certify — you identify what needs formal engineering
(RPEQ/PE stamp) and give indicative guidance on structure type, spans and bracing.`,
    starters: ["Are these spans reasonable?", "What will an engineer flag on this design?", "Steel or timber frame for this build?"],
  },
  {
    id: "interior", name: "Sofia", role: "Interior Designer", emoji: "🎨",
    tone: "Warm, practical, budget-aware. Finishes, layout flow, light.",
    focus: `You are Sofia, an interior designer who works with real construction budgets. You advise on
finishes, room flow, natural light, kitchens and bathrooms — always tied to the material lines that
exist in the estimate, suggesting upgrades or savings with realistic cost impact.`,
    starters: ["Upgrade ideas for the kitchen within budget?", "Which finishes give the most impact for least cost?", "How do I make the living areas feel bigger?"],
  },
  {
    id: "planner", name: "David", role: "Planner", emoji: "🗓️",
    tone: "Programme-obsessed. Critical path, trades sequencing, lead times.",
    focus: `You are David, a construction planner. You think in critical path, trade sequencing, lead
times (trusses, windows, switchboards), wet weather allowances, and inspection hold points. You turn
the estimate's timeline into practical scheduling advice.`,
    starters: ["What's on the critical path?", "What should I order early?", "How do I shave two weeks off this programme?"],
  },
  {
    id: "procurement", name: "Amara", role: "Procurement Officer", emoji: "📦",
    tone: "Deal-hunter. Suppliers, alternates, order bundling, waste.",
    focus: `You are Amara, a procurement officer for construction. You bundle orders by supplier,
suggest cheaper equivalent products, time purchases against the programme, and watch order
quantities vs waste allowances. You reference the supplier directory categories the app links to.`,
    starters: ["How should I bundle these orders?", "Cheaper alternatives for the expensive lines?", "What do I buy first?"],
  },
];

/* Shared action protocol appended to every persona's system prompt. The
   update_spec field list is mode-specific — residential, high-rise, and quote
   (materials) each carry a different spec shape, and a patch with fields from
   the wrong mode silently writes into state nothing on screen reads. */
const UPDATE_SPEC_FIELDS = {
  residential: `widthM, lengthM, floors, wallHeightM, roofPitch, claddingType(brick|weatherboard|render), roofType(colorbond|tile|shingle), framingType(timber|steel), siteCondition(flat|sloping|difficult)`,
  highrise: `floorPlateM2, floors, floorHeightM, basementLevels, structureType(rc|steel|composite), facadeType(curtain_wall|precast|brick|render), occupancy(office|residential|hotel|mixed|retail), passengerLifts, goodsLifts, siteCondition(flat|sloping|difficult)`,
};

export function actionProtocol(buildMode) {
  const fields = UPDATE_SPEC_FIELDS[buildMode];
  const updateSpecLine = fields
    ? `<action>{"type":"update_spec","patch":{"<field>":<value>},"label":"<short description>"}</action>\nValid update_spec fields (${buildMode}): ${fields}.`
    : `Do NOT emit update_spec in this mode — a quote/materials project has no building dimensions, only line items.`;
  return `
When you recommend a concrete change the app can make, append it at the END of your reply as an action block:
${updateSpecLine}
<action>{"type":"add_quote_lines","lines":[{"kind":"element","label":"<desc>","qty":<n>,"unit":"<u>","rate":<n>}],"label":"<short description>"}</action>
Use at most 2 action blocks per reply, only when genuinely helpful. Keep replies under 250 words, specific to THIS project's numbers.`;
}

/* Back-compat export (residential field list) for any caller not yet passing buildMode. */
export const ACTION_PROTOCOL = actionProtocol("residential");

export function buildSystemPrompt(persona, ctx) {
  return `${persona.focus}

CURRENT PROJECT — "${ctx.name}" (${ctx.buildMode}, region ${ctx.region}):
${ctx.specSummary}

ESTIMATE SNAPSHOT:
${ctx.estimateSummary}

${actionProtocol(ctx.buildMode)}`;
}

/* Compact, token-cheap context builders */
export function summariseSpec(buildMode, spec, hrSpec, est) {
  if (buildMode === "highrise") {
    const s = hrSpec || {};
    return `Tower: ${s.floors} floors × ${s.floorPlateM2}m² plate, ${s.floorHeightM}m floor-to-floor, ${s.basementLevels} basements, ${s.structureType} structure, ${s.facadeType} facade, ${s.occupancy} occupancy, site ${s.siteCondition}.`;
  }
  if (buildMode === "materials") {
    const n = (est && est.lines) ? est.lines.length : 0;
    return `Quote/materials project — no building dimensions, just a line-item list (${n} line${n === 1 ? "" : "s"}: materials, labour & trade items). Use add_quote_lines to suggest additions.`;
  }
  const s = spec || {};
  return `House: ${s.widthM}×${s.lengthM}m, ${s.floors} floor(s), walls ${s.wallHeightM}m, roof ${s.roofType} @ ${s.roofPitch}°, ${s.claddingType} cladding, ${s.framingType} frame, ${(s.rooms || []).length} rooms, ${(s.kitchens || []).length} kitchen(s), ${(s.bathrooms || []).length} bathroom(s), site ${s.siteCondition}.`;
}

export function summariseEstimate(est, currency) {
  if (!est) return "No estimate yet.";
  const money = (v) => `${currency}${Math.round(v || 0).toLocaleString()}`;
  if (est.mode === "highrise")
    return `Total ${money(est.total)} (${money(est.total / Math.max(1, est.takeoff?.gfaM2 || 1))}/m² GFA). Systems ${money(est.systemsTotal)}, prelims ${money(est.prelims)}, design ${money(est.designFees)}, contingency ${money(est.contingency)}. Programme ${est.timeline?.totalWeeks} weeks.`;
  if (est.mode === "materials")
    return `Quote total ${money(est.total)} across ${(est.lines || []).length} lines (materials ${money(est.byKind?.material)}, labour ${money(est.byKind?.labour)}, trades ${money(est.byKind?.element)}).`;
  const top = (est.materialLines || []).slice()
    .sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 6)
    .map((l) => `${l.label} ${money(l.total)}`).join("; ");
  return `Total ${money(est.total)}. Materials ${money(est.materialsTotal)}, labour ${money(est.labourTotal)}, equipment ${money(est.equipmentTotal)}, prelims ${money(est.prelims)}, margin ${money(est.margin)}, contingency ${money(est.contingency)}. Programme ${est.timeline?.totalWeeks} weeks. Biggest materials: ${top}.`;
}

/* Parse <action>…</action> blocks out of a reply → { text, actions[] } */
export function parseActions(reply) {
  const actions = [];
  const text = reply.replace(/<action>([\s\S]*?)<\/action>/g, (_, body) => {
    try { actions.push(JSON.parse(body.trim())); } catch { /* ignore malformed */ }
    return "";
  }).trim();
  return { text, actions };
}
