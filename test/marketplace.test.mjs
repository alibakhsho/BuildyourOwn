const M = await import("../src/logic/marketplace.js");

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
};

// --- Publishing rules (mirror the database CHECKs for a live listing) ---
const prefab = {
  kind: "module", saleMode: "prefab", title: "Studio pod 6x3", mediaPaths: ["u/pod.jpg"],
  siteWorks: { footings: "excluded", transport: "included", services: "excluded", approvals: "excluded" },
  leadTimeWeeks: 10,
};
ok("complete prefab listing is publishable", M.publishProblems(prefab), []);
ok("prefab must answer every site-works item", M.publishProblems({ ...prefab, siteWorks: { footings: "excluded" } }).length, 1);
ok("prefab needs a lead time", M.publishProblems({ ...prefab, leadTimeWeeks: null }), ["Add a lead time in weeks"]);
ok("plan sale needs copyright confirmation",
  M.publishProblems({ kind: "plan", saleMode: "plan_purchase", title: "Queenslander 4x2", mediaPaths: ["a.jpg"] }),
  ["Confirm you own this design or are licensed to sell it"]);
ok("build-only needs no copyright tick or price",
  M.publishProblems({ kind: "plan", saleMode: "build_only", title: "Display home", mediaPaths: ["a.jpg"] }), []);
ok("no photo, no listing", M.publishProblems({ kind: "plan", saleMode: "build_only", title: "Display home", mediaPaths: [] }),
  ["Add at least one photo or render"]);
ok("a plan can't be sold as prefab", M.publishProblems({ ...prefab, kind: "plan" }).length > 0, true);

// --- What the buyer still pays for ---
ok("buyer told what else to budget for", M.prefabExtras(prefab).length, 3);

// --- Prices and fees ---
ok("no price = price on enquiry", M.priceLabel(null), "Price on enquiry");
ok("indicative price", M.priceLabel(32500000), "From A$325,000");
ok("plans and modules: fee discussed on contract", [M.PLATFORM_FEES.plan.rate, M.PLATFORM_FEES.module.label], [null, "Discussed on contract"]);
ok("1.5% of a $450k contract", M.contractFee(450000), 6750);

// --- Row mapping round-trips ---
const row = M.listingToRow({ ...prefab, priceCents: 8500000, bedrooms: "1", floorAreaM2: "18.5", regions: ["QLD", "XX"], inclusions: [" Bathroom ", ""] });
ok("seller can't write status/hidden/view_count", ["status", "hidden", "view_count", "seller_id"].some((k) => k in row), false);
ok("regions limited to real states", row.regions, ["QLD"]);
ok("blank inclusions dropped and trimmed", row.inclusions, ["Bathroom"]);
ok("numbers parsed", [row.bedrooms, row.floor_area_m2, row.price_cents], [1, 18.5, 8500000]);
ok("plans carry no site works", M.listingToRow({ kind: "plan", saleMode: "build_only", siteWorks: { footings: "included" } }).site_works, {});
const back = M.listingFromRow({ ...row, id: "x", status: "live", view_count: 7, seller: { user_id: "u", display_name: "Coast Homes", kind: "builder" } });
ok("row -> listing", [back.saleMode, back.viewCount, back.seller.displayName], ["prefab", 7, "Coast Homes"]);
ok("ABN spaces stripped", M.proToRow({ displayName: "A", abn: "51 824 753 556" }).abn, "51824753556");

// --- Seller dashboard ---
ok("seller stats", M.sellerStats({
  listings: [{ status: "live", viewCount: 10 }, { status: "draft", viewCount: 0 }, { status: "live", hidden: true, viewCount: 3 }],
  enquiries: [{ status: "new" }, { status: "replied" }],
  portfolio: [{}, {}, {}],
}), { live: 1, drafts: 1, hidden: 1, views: 13, newEnquiries: 1, totalEnquiries: 2, portfolio: 3 });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
