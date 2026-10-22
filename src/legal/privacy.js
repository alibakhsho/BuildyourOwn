/* =========================================================================
   MODULE: legal/privacy.js — Privacy Policy (content only; LegalPage renders it).

   Written against what the code actually does — keep it that way. If a new
   feature collects, shares or stores personal information somewhere new
   (a new service provider, a new country, a new field), update this file in
   the same change. Structured on the Australian Privacy Principles. A draft
   for the owner's review, not legal advice.

   Facts it relies on (check them when they change):
     - Supabase project ByO is in region ap-south-1 (Mumbai, India)
     - api/events.js logs IP address and browser details with usage events;
       lib/analytics.js sends only the referring site's origin
       (Vercel Web Analytics is not loaded; if it's added, update "collect")
     - AI chat, project summaries and plan images go to Anthropic
     - fonts load from Google Fonts (design/system.js); self-hosting them
       would let "share" and "overseas" drop Google for most visitors
     - api/account/delete.js deletes the photos, then the account and its
       cloud data; contract fee records are kept (builder name/email snapshot)
     - state/marketplace.js deletes photos taken off a saved listing,
       portfolio job or profile
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
          "Account details: your name, email address and password, the kind of user you are (homeowner, tradie or builder), your company name if you add it, and which version of these documents you agreed to. Passwords are stored in scrambled (hashed) form by our sign-in provider; we can't see them. If you sign in with Google, we receive your name, email address, profile picture and Google account ID from Google.",
          "Plan and billing details: your plan, trial dates and billing status. When you subscribe, Stripe, our payment provider, collects your name, email address, billing address, card details and (if you give it) your ABN. We can see your billing name, address and ABN, but never your card number.",
          "Seller profiles, portfolios and listings: your business name, ABN, licence number and state, the regions you work in, descriptions, prices and photos.",
          "Enquiries: when you contact a seller, your name, email address, phone number (if you give it), the postcode of your build site and your message.",
          "Signed contract records: when a seller records a signed contract with us, the client's name, the contract value, the site postcode, the signing date, any notes the seller adds and, for a Site Office job, the job's name, plus the seller's name, email address and ABN. We get the client's details from the seller, not from the client; a client can contact us to see or correct them.",
          "Projects and estimates: the details you enter. These are kept on your device. When you're signed in, your estimator projects (up to 3 on the free Homeowner plan) are also saved to your account so you can use them on other devices. Site Office jobs stay on your device, except the job and client details sent when you record a signed contract with us.",
          "AI features: if you use them, what you type to the AI assistant and AI quote tools, a summary of the project you're working on (its name, specification and estimate), and any plan image you ask it to read (with the text on that page). Your AI conversations are saved with the project: on your device, and in your account if you're signed in.",
          "Photos: the app asks for camera or photo access only when you choose to take or pick a photo or plan, and uses only the photos you pick.",
          "Usage and device information: which pages and features are used (with summary details such as an estimate's region, build type and total), the website that referred you, your IP address, and your browser and device type. These are recorded in our server logs.",
        ] }],
      },
      {
        id: "use",
        heading: "How we use it",
        body: [{ list: [
          "to create and run your account and provide the features you use, including showing the profiles, portfolios and listings sellers publish;",
          "to pass your enquiry to the seller you contacted, and to email sellers when they receive an enquiry;",
          "to process payments, and to work out and invoice platform fees on recorded contracts;",
          "to produce AI replies and plan readings when you ask for them;",
          "to keep BuildYourOwn secure, prevent misuse (for example by limiting how many enquiries an account can send) and fix problems;",
          "to understand how BuildYourOwn is used and improve it; and",
          "to meet our legal obligations, such as tax and record-keeping.",
        ] },
        "We send emails about your account and the service, such as enquiry alerts and password resets. If we ever send marketing emails, we'll only do so with your consent, and every one will include a way to unsubscribe."],
      },
      {
        id: "share",
        heading: "Who we share it with",
        body: [
          { list: [
            "Sellers you contact: we store your enquiry and send it to that seller, by email and in the app, so they can reply. Sellers are separate businesses that handle your details under their own privacy obligations, and our Terms require them to use your details only to deal with your enquiry.",
            "Everyone: profiles, portfolios and listings sellers publish are public.",
            "Our service providers, who store or process information for us: Supabase (database, sign-in and photo storage), Vercel (website hosting and server logs), Stripe (payments), Resend (sending email), Anthropic (AI features), Google (fonts used on the site, which means your browser sends Google your IP address and browser details, and Google sign-in if you use it), and Xero or MYOB (only if you connect your accounting software, once available).",
            "Others where the law requires or allows it, for example to respond to a lawful request or to protect someone's safety, and a buyer of our business if it's sold.",
          ] },
          "We don't sell personal information.",
        ],
      },
      {
        id: "overseas",
        heading: "Information stored overseas",
        body: [
          "Our main database, sign-in and photo storage (Supabase) are in India. Website hosting and server logs (Vercel), email delivery (Resend), payments (Stripe), AI features (Anthropic) and Google's fonts and sign-in are processed mainly in the United States. Stripe and Google may also process information in other countries listed in their published lists of sub-processors. We choose providers with strong security and privacy commitments, and we take reasonable steps to make sure they handle your information consistently with the Australian Privacy Principles.",
        ],
      },
      {
        id: "security",
        heading: "How we protect it",
        body: [
          "Information travels encrypted between your device and our servers. Database access rules limit who can see each record: you can see your own information, a seller can see the enquiries sent to them, and only our server and the people who run BuildYourOwn can see more. No system is perfectly secure, but if a data breach is likely to cause someone serious harm, we'll notify them and the Office of the Australian Information Commissioner as the law requires.",
        ],
      },
      {
        id: "keep",
        heading: "How long we keep it",
        body: [{ list: [
          "Account, profile, listing, portfolio and project information: while your account is open. Photos you remove from a listing, portfolio or profile are deleted when you save the change.",
          `When you delete your account (in the app, or on the website under Account), or ask us to by emailing ${email} from your account's email address, we delete your account, profile, listings, portfolio and photos, your saved projects, and enquiries you sent. Enquiries other people sent you are deleted with your seller profile. Copies of an enquiry already emailed to a seller stay with that seller, who is responsible for them, and cached copies of public photos can take a short time to clear.`,
          "Signed contract records are kept after an account is deleted, for as long as tax and accounting laws require (generally 5 to 7 years), because they record fees. Billing records held by Stripe for paid plans (your name, email address, billing address, ABN and invoices) are also kept for as long as tax laws require.",
          "Server logs are kept for a limited period by our hosting provider and then deleted.",
          "Copies in backups are removed as those backups expire.",
        ] }],
      },
      {
        id: "rights",
        heading: "Your choices and rights",
        body: [
          `You can see and update most of your information in the app, and delete your account there at any time. You can also ask us for a copy of the personal information we hold about you, ask us to correct it, or ask us to delete your account by emailing ${email}. We'll respond within 30 days.`,
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
          "We'll update this policy when the way we handle personal information changes. The date at the top shows when this version takes effect, and we'll tell you about significant changes by email or in the app.",
        ],
      },
    ],
  };
}
