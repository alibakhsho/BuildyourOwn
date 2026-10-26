/* Terms of Use and Privacy Policy: content is well-formed, says what the
   business model and the code actually do, and never ships "undefined". */
import { termsOfUse } from "../src/legal/terms.js";
import { privacyPolicy } from "../src/legal/privacy.js";
import { LEGAL, missingDetails, operatorName, versionDate } from "../src/legal/company.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};
const text = (d) => [d.title, d.intro, ...d.sections.flatMap((s) => [s.heading, ...s.body.flatMap((b) => (typeof b === "string" ? [b] : b.list))])].join("\n");

const filled = { ...LEGAL, legalName: "Example Pty Ltd", abn: "51 824 753 556", contactEmail: "hello@example.com" };
for (const [name, make] of [["terms", termsOfUse], ["privacy", privacyPolicy]]) {
  const d = make(filled), t = text(d);
  ok(`${name}: no undefined/null/NaN in the text`, !/\b(undefined|null|NaN)\b|\[object/.test(t));
  ok(`${name}: section ids unique and link-safe`, new Set(d.sections.map((s) => s.id)).size === d.sections.length && d.sections.every((s) => /^[a-z-]+$/.test(s.id)));
  ok(`${name}: every block is a paragraph or a non-empty list`, d.sections.every((s) => s.body.length && s.body.every((b) => typeof b === "string" ? b.trim().length > 0 : Array.isArray(b.list) && b.list.length > 0)));
  ok(`${name}: names the operator and contact`, t.includes("Example Pty Ltd (ABN 51 824 753 556), trading as BuildYourOwn") && t.includes("hello@example.com"));
  ok(`${name}: has a version date`, /^\d{4}-\d{2}-\d{2}$/.test(d.version) && /\d{4}$/.test(versionDate(d.version)));
}

const terms = text(termsOfUse(filled));
ok("terms: the 1.5% fee, 14-day recording and 12-month window", terms.includes("1.5% of the contract value") && terms.includes("within 14 days") && terms.includes("12 months"));
ok("terms: plans/modules fee only when agreed in writing", terms.includes("agreed between you and us in writing"));
ok("terms: Australian Consumer Law rights preserved", terms.includes("can't be excluded"));
ok("terms: notice before changes, with a way out", terms.includes("at least 30 days before it takes effect"));
ok("terms: governing law is the configured state", terms.includes(`laws of ${LEGAL.state}`));
ok("terms: section links used in the app exist", ["fees", "buyers", "sellers"].every((id) => termsOfUse(filled).sections.some((s) => s.id === id)));
ok("privacy: section links used in the app exist", ["share"].every((id) => privacyPolicy(filled).sections.some((s) => s.id === id)));

const privacy = text(privacyPolicy(filled));
ok("privacy: names every service provider the code uses", ["Supabase", "Vercel", "Stripe", "Resend", "Anthropic", "Google", "Xero"].every((p) => privacy.includes(p)));
ok("privacy: discloses overseas storage (India, United States)", privacy.includes("India") && privacy.includes("United States"));
ok("privacy: enquiry details go to the seller", privacy.includes("send it to that seller, by email and in the app"));
ok("privacy: AI content and fonts disclosed", privacy.includes("what you type to the AI assistant") && privacy.includes("fonts used on the site"));
ok("privacy: deletion by email", privacy.includes("ask us to delete your account by emailing"));
ok("privacy: contract records kept after deletion", privacy.includes("kept after an account is deleted"));
ok("privacy: OAIC complaints route", privacy.includes("oaic.gov.au"));

// Unfilled details are visible, never silently blank
ok("missing details are listed", JSON.stringify(missingDetails({ ...LEGAL, legalName: null, abn: null, contactEmail: null })) === JSON.stringify(["legal business name", "ABN", "contact email"]));
ok("unfilled operator shows a placeholder", operatorName({ ...LEGAL, legalName: null, abn: null }).includes("[legal business name to be added]"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
