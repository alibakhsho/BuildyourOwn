/* =========================================================================
   MODULE: legal/company.js — who runs BuildYourOwn, for the legal pages.

   FILL THESE IN BEFORE LAUNCH. Until they're set, the Terms and Privacy
   pages show a visible "[ … ]" placeholder in their place, so a missing
   detail is obvious rather than silently wrong.

   Bump the version dates when the wording of a document changes in a way
   people should agree to again (the app records which Terms version a
   seller accepted).
   ========================================================================= */

export const LEGAL = {
  tradingName: "BuildYourOwn",
  legalName: null,          // the registered business or company name, e.g. "Example Pty Ltd"
  abn: null,                // 11 digits, e.g. "51 824 753 556"
  contactEmail: null,       // a mailbox you read, e.g. "hello@buildyourown.dev"
  state: "Queensland",      // whose courts and laws govern the Terms
  site: "buildyourown.dev",
  termsVersion: "2026-10-22",
  privacyVersion: "2026-10-22",
};

const placeholder = (what) => `[${what} to be added]`;

/** "Example Pty Ltd (ABN 51 824 753 556), trading as BuildYourOwn" */
export function operatorName(L = LEGAL) {
  const legal = L.legalName || placeholder("legal business name");
  const abn = L.abn ? ` (ABN ${L.abn})` : ` (${placeholder("ABN")})`;
  return `${legal}${abn}, trading as ${L.tradingName}`;
}

export const contactEmail = (L = LEGAL) => L.contactEmail || placeholder("contact email");

/** Details still missing — shown to whoever reviews the pages, never hidden. */
export function missingDetails(L = LEGAL) {
  return [
    !L.legalName && "legal business name",
    !L.abn && "ABN",
    !L.contactEmail && "contact email",
  ].filter(Boolean);
}

/** Human date for "Last updated", from a YYYY-MM-DD version. */
export function versionDate(v) {
  const [y, m, d] = String(v).split("-").map(Number);
  if (!y || !m || !d) return String(v);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}
