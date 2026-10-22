/* =========================================================================
   MODULE: legal/terms.js — Terms of Use (content only; LegalPage renders it).

   Plain English on purpose. These are standard-form terms with consumers
   and small businesses, so the Australian Consumer Law and the unfair
   contract terms regime apply: obligations run both ways, changes come with
   notice and a way out, and nothing here tries to remove rights the law
   gives people. A draft for the owner's review, not legal advice.

   Blocks: a string is a paragraph; { list: [...] } is a bullet list.
   ========================================================================= */

import { LEGAL, operatorName, contactEmail } from "./company.js";

export function termsOfUse(L = LEGAL) {
  const op = operatorName(L);
  const email = contactEmail(L);
  return {
    id: "terms",
    title: "Terms of Use",
    version: L.termsVersion,
    intro: `These terms are an agreement between you and ${op} ("we", "us"). They cover the BuildYourOwn website at ${L.site}, the BuildYourOwn app, and everything in them. Please read them. By creating an account, or by using BuildYourOwn, you agree to them. If you use BuildYourOwn for a business, you agree to them for that business too.`,
    sections: [
      {
        id: "what",
        heading: "What BuildYourOwn is",
        body: [
          "BuildYourOwn gives you tools to estimate building work, manage jobs (Site Office), and find or offer building services, plans and prefab modules (the Marketplace).",
          "We provide the platform. We are not a builder, designer, engineer, certifier or supplier, and we don't give professional advice. We are not a party to any contract between people who meet through BuildYourOwn, such as a building contract or a sale of plans.",
        ],
      },
      {
        id: "estimates",
        heading: "Estimates and building information are a guide",
        body: [
          "Estimates, quotes you prepare, approval checklists, building-code references and anything produced by our AI features are indicative. They depend on the information entered and on market rates that change. They are not a fixed price, a certified take-off, engineering, or advice about what your project legally needs.",
          "Before relying on them, get advice from licensed professionals (for example a builder, quantity surveyor, engineer or building certifier) who know your site.",
        ],
      },
      {
        id: "account",
        heading: "Your account",
        body: [{ list: [
          "You must be 18 or over to create an account.",
          "Give accurate details and keep them up to date.",
          "Keep your password private. You're responsible for what happens under your account; tell us straight away if you think someone else has used it.",
        ] }],
      },
      {
        id: "plans",
        heading: "Plans, trials and payment",
        body: [
          "Some features need a paid plan. Prices are in Australian dollars. The Homeowner AI add-on is shown at the price you pay, including GST. Tradie and Builder are business plans and are shown before GST, with the GST-inclusive total next to them. The checkout page shows the total before you pay.",
          "Paid plans are billed in advance through our payment provider, Stripe, and renew automatically each month or year until you cancel. If you subscribe during a free trial, your first payment is usually taken when the trial ends; the checkout page shows the date.",
          "You can cancel at any time in your account on the BuildYourOwn website (Account, then Manage billing) or by emailing us. Cancelling stops the next renewal; you keep the plan until the end of the period you've paid for.",
          "Free trials last for the period shown when you start them and are available once per account. A trial doesn't need a card. When it ends you move to the free plan unless you subscribe.",
          "If we change the price of a plan, we'll tell you at least 30 days before. The new price applies from your first renewal after that notice, and you can cancel before then.",
          "Deleting your account ends any paid plan straight away, including the rest of the period you've paid for, so cancel first if you'd rather use it until then.",
          "Nothing in these terms limits a refund or other remedy you're entitled to under the Australian Consumer Law.",
        ],
      },
      {
        id: "sellers",
        heading: "Selling on the Marketplace",
        body: [
          "If you publish a profile, portfolio or listing (a \"seller\"), you agree that:",
          { list: [
            "You hold, and will keep, every licence, registration and insurance the law requires for the work you offer (including home warranty insurance where it's compulsory), and the licence details you show are yours and current.",
            "You are responsible for your designs, plans, quotes, contracts and work, and for any engineering, permits and approvals they need.",
            "Your profile, portfolio and listings are accurate and not misleading, including prices, what a price includes, lead times and photos. Portfolio jobs are work you actually did.",
            "You own, or have permission to use and sell, the designs, plans and photos you upload.",
            "You'll use an enquirer's details only to reply to their enquiry and deal with them about it, and you'll comply with the Privacy Act and the Spam Act when you do.",
            "When you record a signed contract with us, you'll tell your client that you're giving us their name, site postcode and the contract value so we can work out our fee, and where to find our Privacy Policy.",
            "You'll comply with the Australian Consumer Law and the building laws of each state you work in.",
          ] },
          "A \"Verified\" tick next to a seller means that, when we added it, we checked that the ABN on their profile was active on the Australian Business Register and that the licence number shown was current on the state licence register. The tick comes off automatically if the seller changes those details. It doesn't cover insurance, the quality of their work, their designs or their prices, and it isn't an endorsement or a guarantee.",
        ],
      },
      {
        id: "fees",
        heading: "Platform fee on building contracts",
        body: [
          "If you are a builder or trade business and you sign a contract to carry out building work with a client you met through BuildYourOwn, you pay us a platform fee of 1.5% of the contract value.",
          "\"Met through BuildYourOwn\" means that, in the 12 months before the contract was signed, the client (or someone acting for them, such as their partner, company or trust) sent you an enquiry through the BuildYourOwn Marketplace, and you weren't already dealing with them about that project. The fee applies to contracts to carry out building work, not to design-only contracts. Clients you found any other way carry no fee.",
          { list: [
            "\"Contract value\" is the contract price at signing, excluding GST. Variations after signing don't change the fee.",
            "Record each such contract in BuildYourOwn (\"Contract signed\") within 14 days of signing it. You can correct or void a record within 14 days of recording it, unless we've already invoiced it; after that, contact us and we'll correct or cancel the invoice.",
            "Recording a contract doesn't by itself create a fee. If you record a contract with a client you didn't meet through BuildYourOwn, void it, or tell us and we'll cancel the fee.",
            "We invoice the fee, plus GST if it applies. It's due 14 days after the invoice date.",
            "If a contract is withdrawn from (including in a statutory cooling-off period) or ends before work starts, tell us and we'll cancel or credit the fee in full. If it ends after work starts, we'll recalculate the fee on what the client actually paid you, excluding GST.",
            "If we reasonably ask, give us enough information to confirm a contract's value or date (for example the signed contract's first page), with private details removed.",
            "If you close your account or stop selling, the fee still applies to a contract you sign with a client you met through BuildYourOwn, and you must tell us about it within 14 days of signing.",
          ] },
          "Fees on sales of house plans or prefab modules through the Marketplace are agreed between you and us in writing before they apply. Until a fee is agreed, none applies to those sales.",
          "We'll give you at least 30 days' notice before changing the platform fee. A change applies only to clients who first contact you through the Marketplace after it takes effect.",
        ],
      },
      {
        id: "buyers",
        heading: "Buying or hiring through the Marketplace",
        body: [
          "Sellers are independent businesses. We don't supervise their work, and apart from the ABN and licence check a \"Verified\" tick describes, we don't check their licences, insurance, designs or prices.",
          "Before you sign anything, check the seller's licence on the state register, ask for proof of insurance and references, and read the contract. Your contract, and your rights under it and under the Australian Consumer Law, are with the seller.",
          "If you have a problem with a seller, tell us. We can't resolve disputes between you, but we'll act on breaches of these terms, which can include removing a listing or a seller.",
        ],
      },
      {
        id: "content",
        heading: "Your content",
        body: [
          "You keep ownership of what you upload: photos, plans, descriptions, estimates and messages.",
          "So we can run BuildYourOwn, you give us a non-exclusive, royalty-free licence to store, copy, resize and display your content for as long as it's on BuildYourOwn. If you publish a profile, portfolio or listing, the licence also lets us show it publicly, including in search results and in promoting BuildYourOwn. It ends when you remove the content, except for copies we must keep by law or that are in backups we delete in the normal course.",
          "We may remove or hide content that breaches these terms or the law, or that someone credibly says infringes their rights.",
        ],
      },
      {
        id: "use",
        heading: "Fair use",
        body: [
          "Don't use BuildYourOwn to:",
          { list: [
            "break the law, mislead people, or infringe anyone's rights;",
            "post content that isn't yours to post, or that's offensive or harassing;",
            "avoid the platform fee, for example by asking a client who found you through BuildYourOwn to deal with you elsewhere so a contract isn't recorded;",
            "copy or scrape listings, profiles or data in bulk, or send spam;",
            "pretend to be someone else, or test, probe or disrupt our systems.",
          ] },
        ],
      },
      {
        id: "suspension",
        heading: "Taking content down, suspending and closing accounts",
        body: [
          "If we reasonably believe you've breached these terms (including by not paying an invoice when due), we may hide your listings, suspend your seller profile or close your account. Where it's reasonable to, we'll tell you why first and give you a chance to fix it. We may act straight away where there's a risk to other people or to BuildYourOwn.",
          "You can delete your account at any time in the app or on the website, or ask us to by email. Fees you already owe stay payable, and we keep fee records for as long as tax and accounting laws require.",
          "If we close your account, or stop offering BuildYourOwn or a paid feature, for any reason other than your breach of these terms, we'll give you at least 30 days' notice where we reasonably can, let you download your projects, and refund what you've paid for any period after that date.",
        ],
      },
      {
        id: "third-parties",
        heading: "Other services",
        body: [
          "Some features use other companies' services, such as Stripe for payments, Google for sign-in, Xero or MYOB if you connect them (once available), and AI providers for AI features. Their own terms also apply when you use them. We aren't responsible for their services.",
        ],
      },
      {
        id: "liability",
        heading: "Our responsibility to you",
        body: [
          "You have rights under the Australian Consumer Law that can't be excluded. Nothing in these terms excludes, restricts or changes them.",
          "Apart from those rights, and to the extent the law allows:",
          { list: [
            "we provide BuildYourOwn as it is, and we don't promise it will always be available or free of errors;",
            "we're not responsible for building work, designs, contracts, prices or advice provided by sellers or other users, or for losses arising between users;",
            "we're not liable for indirect or consequential loss, such as lost profits or lost opportunities; and",
            "if you use BuildYourOwn for a business, and except for liability for fraud, wilful misconduct, personal injury or our breach of privacy law, our total liability for all claims connected with BuildYourOwn is limited to the greater of A$500 and the fees you paid us in the 12 months before the claim. Where the law lets us limit our liability for services, we may instead limit it to supplying the services again or paying the cost of having them supplied again.",
          ] },
        ],
      },
      {
        id: "indemnity",
        heading: "Sellers' responsibility to us",
        body: [
          "If you're a seller, you're responsible for claims made against us by other people to the extent they're caused by your work, your listings or content, or your breach of these terms or the law. This doesn't apply to the extent we caused or contributed to the loss.",
        ],
      },
      {
        id: "changes",
        heading: "Changes to these terms",
        body: [
          "We may update these terms as BuildYourOwn changes. If a change is to your detriment, we'll tell you by email or in the app at least 30 days before it takes effect. If you don't agree, you can close your account before then and we'll refund what you've paid for any period after the change takes effect; fees you already owe stay payable. The date at the top shows when this version takes effect.",
        ],
      },
      {
        id: "general",
        heading: "General",
        body: [
          `These terms are governed by the laws of ${L.state}, Australia, and the courts of ${L.state} can hear disputes about them. If there's a disagreement, please contact us first so we can try to sort it out.`,
          "If part of these terms can't be enforced, the rest still applies. If we don't enforce a term straight away, we can still enforce it later.",
          `Questions about these terms: ${email}.`,
        ],
      },
    ],
  };
}
