const M = await import("../src/logic/marketplace.js");

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
};

const prefab = {
  saleMode: "prefab", title: "Studio pod 6x3", priceCents: 8_500_000, media: ["pod.jpg"],
  inclusions: ["Fully fitted studio", "Bathroom", "Electrical to board"],
  siteWorks: { footings: "excluded", transport: "included", services: "excluded", approvals: "excluded" },
  deliveryRegions: ["QLD", "NSW"], leadTimeWeeks: 10,
};
ok("complete prefab listing is valid", M.validateListing(prefab).ok, true);
ok("prefab must declare site works", M.validateListing({ ...prefab, siteWorks: {} }).errors.length, 1);
ok("buyer told what else to budget for", M.prefabExtras(prefab).length, 3);
ok("plan sale needs copyright confirmation",
  M.validateListing({ saleMode: "plan_purchase", title: "Queenslander 4x2", priceCents: 250000, media: ["a.jpg"] }).errors,
  ["seller must confirm they own or are licensed to sell this design"]);
ok("build-only needs no price", M.validateListing({ saleMode: "build_only", title: "Display home", media: ["a.jpg"] }).ok, true);

const t = M.checkoutTotals(prefab, { deliveryCents: 500_000 });
ok("prefab checkout", t, { subtotalCents: 9_000_000, gstCents: 900_000, buyerPaysCents: 9_900_000, platformFeeCents: 135_000, sellerReceivesCents: 9_765_000 });
ok("plan checkout ignores delivery", M.checkoutTotals({ saleMode: "plan_purchase", priceCents: 250000 }, { deliveryCents: 9999 }).subtotalCents, 250000);
let threw = false; try { M.checkoutTotals({ saleMode: "build_only" }); } catch { threw = true; }
ok("build-only cannot be bought outright", threw, true);
ok("1.5% of a $450k contract", M.contractFee(450000), 6750);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
