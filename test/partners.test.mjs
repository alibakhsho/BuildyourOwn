const P = await import("../src/partners/contracts.js");

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
};

const NOW = Date.parse("2026-10-20T00:00:00Z");
const price = (o = {}) => ({
  partnerId: "supplier_a", sku: "PINE-90x45-MGP10", description: "90x45 MGP10 pine", unit: "lm",
  unitPriceCents: 650, region: "QLD", validUntil: "2026-11-20T00:00:00Z", ...o,
});

// --- Prices ---
ok("valid price passes", P.validatePriceQuote(price(), { now: NOW }).ok, true);
ok("expired price rejected", P.validatePriceQuote(price({ validUntil: "2026-10-01T00:00:00Z" }), { now: NOW }).errors, ["price has expired"]);
ok("float money rejected", P.validatePriceQuote(price({ unitPriceCents: 6.5 }), { now: NOW }).ok, false);
ok("no expiry, no price", P.validatePriceQuote(price({ validUntil: undefined }), { now: NOW }).ok, false);

const best = P.bestPrice([
  price({ partnerId: "a", unitPriceCents: 600, deliveryCents: 20000 }),   // 600*100+20000 = 80000
  price({ partnerId: "b", unitPriceCents: 700 }),                          // 70000
  price({ partnerId: "c", unitPriceCents: 500, region: "NSW" }),           // wrong region
  price({ partnerId: "d", unitPriceCents: 400, validUntil: "2026-01-01T00:00:00Z" }), // expired
], { region: "QLD", qty: 100, now: NOW });
ok("best landed price, region and expiry respected", [best.partnerId, best.landedCents], ["b", 70000]);
ok("quote valid until earliest price expiry",
  P.quoteValidUntil([{ validUntil: "2026-12-01T00:00:00Z" }, { validUntil: "2026-11-15T00:00:00Z" }]),
  "2026-11-15T00:00:00.000Z");

// --- Trades ---
const sparky = (o = {}) => ({
  partnerId: "trades_x", tradieId: "t1", trade: "electrician", businessName: "Bright Sparks",
  abn: "51 824 753 556", serviceAreas: ["4870", "4868"],
  insurance: { publicLiabilityCents: 10_000_000_00, expiresAt: "2027-06-30T00:00:00Z" },
  licence: { number: "123456", state: "QLD", expiresAt: "2027-01-01T00:00:00Z" },
  rate: { type: "hourly", amountCents: 11000 }, ...o,
});
const q = { trade: "electrician", state: "QLD", postcode: "4870", date: NOW };
ok("licensed, insured, local tradie is eligible", P.dispatchEligibility(sparky(), q).eligible, true);
ok("expired licence blocks", P.dispatchEligibility(sparky({ licence: { number: "1", state: "QLD", expiresAt: "2026-01-01T00:00:00Z" } }), q).reasons, ["licence expired"]);
ok("interstate licence blocks", P.dispatchEligibility(sparky({ licence: { number: "1", state: "NSW", expiresAt: "2027-01-01T00:00:00Z" } }), q).reasons, ["licence is for NSW, job is in QLD"]);
ok("low public liability blocks", P.dispatchEligibility(sparky({ insurance: { publicLiabilityCents: 1_000_000_00, expiresAt: "2027-06-30T00:00:00Z" } }), q).reasons, ["public liability below A$5m"]);
ok("outside service area blocks", P.dispatchEligibility(sparky(), { ...q, postcode: "4000" }).reasons, ["does not service this postcode"]);
ok("electrician without licence fails validation", P.validateTradeOffer(sparky({ licence: undefined })).ok, false);
ok("painter needs no licence", P.validateTradeOffer(sparky({ trade: "painter", licence: undefined })).ok, true);

// --- Registry: a failing partner never sinks the rest ---
const off1 = P.registerPartner({ id: "good", kind: "pricing", quotePrices: async () => [price({ validUntil: "2099-01-01T00:00:00Z" })] });
const off2 = P.registerPartner({ id: "broken", kind: "pricing", quotePrices: async () => { throw new Error("down"); } });
const off3 = P.registerPartner({ id: "junk", kind: "pricing", quotePrices: async () => [{ sku: "x" }] });
const live = await P.livePrices([{ catalogueId: "pine", qty: 10 }], "QLD");
ok("live prices: good kept, broken and junk dropped", live.length, 1);
off1(); off2(); off3();
let threw = false; try { P.registerPartner({ id: "x", kind: "nonsense" }); } catch { threw = true; }
ok("unknown partner kind rejected", threw, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
