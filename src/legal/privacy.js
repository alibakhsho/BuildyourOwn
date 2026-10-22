/* =========================================================================
   MODULE: legal/privacy.js — Privacy Policy (content only; LegalPage renders it).

   Written against what the code actually does — keep it that way. If a new
   feature collects, shares or stores personal information somewhere new
   (a new service provider, a new country, a new field), update this file in
   the same change. Structured on the Australian Privacy Principles. A draft
   for the owner's review, not legal advice.

   Facts it relies on (check them when they change):
     - Supabase project ByO is in region ap-south-1 (Mumbai, India)
     - api/events.js logs IP address and browser details with usage events
       (Vercel Web Analytics is not loaded; if it's added, update "collect")
     - AI plan reading sends the chosen plan image to Anthropic
     - api/account/delete.js deletes the account, its cloud data and photos;
       contract fee records are kept (builder name/email snapshot)
   ========================================================================= */

import { LEGAL, operatorName, contactEmail } from "./company.js";

export function privacyPolicy(L = LEGAL) {
  const op = operatorName(L);
  const email = contactEmail(L);
  return {
    id: "privacy",
    title: "Privacy Policy",
    version: L.privacyVersion,
    intro: `This policy explains how ${op} ("we", "us") collects, uses, shares and protects personal information when you use BuildYourOwn (the website at ${L.site} and the app). We handle personal information in line with the Australian Privacy Principles.`,
    sections: [
      {
        id: "collect",
        heading: "What we collect",
        body: [{ list: [
          "Account details: your name, email address and password. Passwords are stored in scrambled (hashed) form by our sign-in provider; we can't see them. If you sign in with Google, we receive your name and email address from Google.",
          "Plan and billing details: your plan, trial dates and billing status. Card details go directly to Stripe, our payment provider; we never see or store your card number.",
          "Seller profiles, portfolios and listings: your business name, ABN, licence number and state, the regions you work in, descriptions, prices and photos. These are public once you publish them.",
          "Enquiries: when you contact a seller, your name, email address, phone number (if you give it), the postcode of your build site and your message.",
          "Signed contract records: when a seller records a signed contract, the client's name, the contract value, the site postcode and the signing date, plus the seller's name, email and ABN.",
          "Projects and estimates: the details you enter. These are kept on your device; when you're signed in, your estimator projects are also saved to your account so you can use them on other devices. Site Office jobs currently stay on your device.",
          "Plan images: if you use AI plan reading, the plan image you choose is sent to our AI provider to be read.",
          "Usage and device information: which pages and features are used (with summary details such as an estimate's region, build type and total), your IP address, and your browser and device type. These are recorded in our server logs.",
        ] }],
      },
      {
        id: "use",
        heading: "How we use it",
        body: [{ list: [
          "to create and run your account and provide the features you use;",
          "to pass your enquiry to the seller you contacted, and to email sellers when they receive an enquiry;",
          "to process payments, and to work out and invoice platform fees on recorded contracts;",
          "to keep BuildYourOwn secure, prevent misuse (for example by limiting how many enquiries an account can send) and fix problems;",
          "to understand how BuildYourOwn is used and improve it; and",
          "to meet our legal obligations, such as tax and record-keeping.",
        ] },
        "We send emails about your account and the service, such as enquiry alerts. If we ever send marketing emails, we'll only do so with your consent, and every one will include a way to unsubscribe."],
      },
      {
        id: "share",
        heading: "Who we share it with",
        body: [
          { list: [
            "Sellers you contact: your enquiry details go to that seller so they can reply. Sellers agree to use them only for that purpose.",
            "Everyone: profiles, portfolios and listings you publish are public.",
            "Our service providers, who store or process information for us: Supabase (database, sign-in and photo storage), Vercel (website hosting and server logs), Stripe (payments), Resend (sending email), Anthropic (AI features), Google (if you sign in with Google), and Xero or MYOB (only if you connect your accounting software).",
            "Others where the law requires or allows it, for example to respond to a lawful request or to protect someone's safety, and a buyer of our business if it's sold.",
          ] },
          "We don't sell personal information.",
        ],
      },
      {
        id: "overseas",
        heading: "Information stored overseas",
        body: [
          "Our main database and photo storage are hosted in India. Our hosting, email, payment and AI providers mainly process information in the United States, and may use other countries where they operate. We choose providers with strong security and privacy commitments, and we take reasonable steps to make sure they handle your information consistently with the Australian Privacy Principles.",
        ],
      },
      {
        id: "security",
        heading: "How we protect it",
        body: [
          "Information travels encrypted between your device and our servers. Database access rules mean each person can only read and change their own private information. Only people who need it to run BuildYourOwn can access our systems. No system is perfectly secure, but if a data breach is likely to cause someone serious harm, we'll notify them and the Office of the Australian Information Commissioner as the law requires.",
        ],
      },
      {
        id: "keep",
        heading: "How long we keep it",
        body: [{ list: [
          "Account, profile, listing, portfolio and project information: while your account is open.",
          "When you delete your account (you can do this in the app), we delete your account, profile, listings, portfolio and photos, your saved projects, and enquiries you sent. Enquiries other people sent you are deleted with your seller profile.",
          "Signed contract records are kept after an account is deleted, for as long as tax and accounting laws require (generally up to 7 years), because they record fees.",
          "Server logs are kept for a limited period by our hosting provider and then deleted.",
          "Copies in backups are removed as those backups expire.",
        ] }],
      },
      {
        id: "rights",
        heading: "Your choices and rights",
        body: [
          "You can see and update most of your information in the app, and delete your account there at any time. You can also ask us for a copy of the personal information we hold about you, or ask us to correct it. We'll respond within 30 days.",
          "You can use the estimator without an account. Your project details then stay on your device, apart from the usage information described above, unless you sign in, use AI features or contact a seller.",
        ],
      },
      {
        id: "cookies",
        heading: "Cookies and storage on your device",
        body: [
          "We use your browser's storage to keep you signed in, remember your settings and save your projects on your device. We don't use advertising cookies or third-party advertising trackers.",
        ],
      },
      {
        id: "children",
        heading: "Children",
        body: ["BuildYourOwn is for adults. We don't knowingly collect information from anyone under 18."],
      },
      {
        id: "contact",
        heading: "Questions and complaints",
        body: [
          `Contact us at ${email} with any question or complaint about privacy. We'll reply within 30 days. If you're not satisfied with our response, you can complain to the Office of the Australian Information Commissioner (oaic.gov.au).`,
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        body: [
          "We'll update this policy when the way we handle personal information changes. The date at the top shows when it last changed, and we'll tell you about significant changes by email or in the app.",
        ],
      },
    ],
  };
}
