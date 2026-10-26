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

// --- Who sells what: builders and architects/designers list, tradies don't ---
const modeIds = (k, who) => M.saleModesFor(k, who).map(([id]) => id);
ok("builders and architects sell, tradies show work", Object.keys(M.PRO_KINDS).filter((k) => M.PRO_KINDS[k].sells), ["builder", "designer"]);
ok("builder plan modes", modeIds("plan", "builder"), ["plan_purchase", "plan_licence", "build_only"]);
ok("architect sells plans but can't offer to build", modeIds("plan", "designer"), ["plan_purchase", "plan_licence"]);
ok("architect can list a prefab design", modeIds("module", "designer"), ["prefab"]);

// --- Values the database would refuse are caught before Save ---
ok("in-range values pass", M.fieldProblems({ bedrooms: "4", bathrooms: "2", storeys: "2", floorAreaM2: "214.5", priceCents: 32500000, leadTimeWeeks: 10 }), []);
ok("out-of-range values are named", M.fieldProblems({ bedrooms: "25", storeys: "0", floorAreaM2: "-3", leadTimeWeeks: 200 }).length, 4);
ok("blank optional numbers are fine", M.fieldProblems({ bedrooms: "", bathrooms: null, floorAreaM2: "" }), []);
ok("too many inclusions", M.fieldProblems({ inclusions: Array.from({ length: 41 }, (_, i) => `item ${i}`) }), ["List at most 40 inclusions"]);
ok("publish blocks on range problems too", M.publishProblems({ ...prefab, leadTimeWeeks: 200 }).includes("Lead time must be 1 to 104 weeks"), true);

// --- Fee line follows how it's sold ---
ok("build-only plan is a build contract", M.listingFeeLabel({ kind: "plan", saleMode: "build_only" }), "1.5% of the signed contract");
ok("selling plans: discussed on contract", M.listingFeeLabel({ kind: "plan", saleMode: "plan_purchase" }), "Discussed on contract");
ok("prefab: discussed on contract", M.listingFeeLabel({ kind: "module", saleMode: "prefab" }), "Discussed on contract");

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

// --- Signed contracts and the 1.5% fee ---
ok("fee preview is 1.5%", M.feePreviewCents(45000000), 675000);
ok("a good contract has no problems", M.contractProblems({ clientName: "Priya", valueCents: 45000000, signedOn: "2026-10-20", sitePostcode: "4870" }, new Date("2026-10-21")), []);
ok("contract needs a client and a value", M.contractProblems({}, new Date("2026-10-21")).length, 2);
ok("future signing date refused", M.contractProblems({ clientName: "P", valueCents: 1, signedOn: "2026-12-01" }, new Date("2026-10-21")), ["The signing date can't be in the future"]);
ok("bad postcode refused", M.contractProblems({ clientName: "P", valueCents: 1, sitePostcode: "48" }), ["A postcode is 4 digits"]);
ok("builder can't write fee or status", Object.keys(M.contractToRow({ clientName: "P", valueCents: 1, feeRate: 0, status: "paid" })).some((k) => ["fee_rate", "status", "fee_cents", "builder_id"].includes(k)), false);
const fresh = { status: "recorded", createdAt: new Date(Date.now() - 86400000).toISOString() };
ok("editable for 14 days while recorded", [M.contractEditable(fresh), M.contractEditable({ ...fresh, status: "invoiced" }), M.contractEditable({ ...fresh, createdAt: new Date(Date.now() - 15 * 86400000).toISOString() })], [true, false, false]);
ok("fee ledger ignores void, splits owing and paid", M.feeSummary([
  { status: "recorded", valueCents: 45000000, feeCents: 675000 },
  { status: "invoiced", valueCents: 10000000, feeCents: 150000 },
  { status: "paid", valueCents: 20000000, feeCents: 300000 },
  { status: "void", valueCents: 99900000, feeCents: 1498500 },
]), { count: 3, valueCents: 75000000, feesCents: 1125000, owingCents: 825000, paidCents: 300000 });
ok("dollars", M.dollars(675000), "A$6,750");
ok("local date, not UTC", M.localDate(new Date(2026, 9, 21, 7, 30)), "2026-10-21");
ok("today is allowed as a signing date", M.contractProblems({ clientName: "P", valueCents: 1, signedOn: M.localDate() }), []);
ok("signed within 12 months of the enquiry: fee applies", M.outsideIntroWindow("2025-10-23T12:00:00Z", "2026-10-22"), false);
ok("signed on the anniversary: still inside", M.outsideIntroWindow("2025-10-22T12:00:00Z", "2026-10-22"), false);
ok("signed more than 12 months later: no fee", M.outsideIntroWindow("2025-10-01T12:00:00Z", "2026-10-22"), true);
ok("no enquiry date: not judged", M.outsideIntroWindow(null, "2026-10-22"), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
