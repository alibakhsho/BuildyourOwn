/* =========================================================================
   COMPONENT: LegalPage — the Terms of Use or the Privacy Policy.

   Content lives in src/legal/ (plain data), so the words are written once
   and shown the same everywhere. Reachable in-app from footers and sign-up,
   and by link: https://buildyourown.dev/?page=terms and ?page=privacy —
   those are the URLs to give the app stores.
   ========================================================================= */

import React, { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { termsOfUse } from "../legal/terms.js";
import { privacyPolicy } from "../legal/privacy.js";
import { missingDetails, versionDate } from "../legal/company.js";

export const LEGAL_DOCS = { terms: termsOfUse, privacy: privacyPolicy };

export default function LegalPage({ doc = "terms", onBack, onOpen }) {
  const d = (Object.prototype.hasOwnProperty.call(LEGAL_DOCS, doc) ? LEGAL_DOCS[doc] : termsOfUse)();
  const missing = missingDetails();
  useEffect(() => {
    const before = document.title;
    document.title = `${d.title} · BuildYourOwn`;
    return () => { document.title = before; };
  }, [d.title]);
  // Arriving from a link like ?page=terms#terms-fees: jump to that section.
  useEffect(() => {
    const id = decodeURIComponent((window.location.hash || "").slice(1));
    if (id.startsWith(`${doc}-`)) document.getElementById(id)?.scrollIntoView();
  }, [doc]);

  return (
    <div className="min-h-[calc(100vh-66px)] bg-paper">
      <article className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
        {onBack && (
          <button onClick={onBack} className="mb-5 flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-steel hover:text-ink">
            <ArrowLeft className="size-3.5" /> Back
          </button>
        )}
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-steel">BuildYourOwn</div>
        <h1 className="mt-1 font-display text-3xl leading-tight text-ink">{d.title}</h1>
        <p className="mt-1 text-xs text-steel">Effective {versionDate(d.version)}</p>

        {missing.length > 0 && (
          <div className="mt-4 border border-hivis-deep bg-warn-wash px-4 py-3 text-sm text-ink" role="note">
            Draft: still to be filled in: {missing.join(", ")}.
          </div>
        )}

        <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">{d.intro}</p>

        <nav aria-label="Contents" className="mt-6 border border-rule bg-card px-4 py-3">
          <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-steel">Contents</div>
          <ol className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
            {d.sections.map((s, i) => (
              <li key={s.id}><a href={`#${doc}-${s.id}`} className="text-ink-soft hover:text-ink hover:underline">{i + 1}. {s.heading}</a></li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-8">
          {d.sections.map((s, i) => (
            <section key={s.id} id={`${doc}-${s.id}`} className="scroll-mt-24">
              <h2 className="font-display text-xl leading-snug text-ink">{i + 1}. {s.heading}</h2>
              <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink-soft">
                {s.body.map((b, j) => (typeof b === "string"
                  ? <p key={j}>{b}</p>
                  : <ul key={j} className="list-disc space-y-1.5 pl-5">{b.list.map((li, k) => <li key={k}>{li}</li>)}</ul>))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-rule pt-4 text-sm text-steel">
          {doc === "terms"
            ? <>See also our <button className="underline hover:text-ink" onClick={() => onOpen?.("privacy")}>Privacy Policy</button>.</>
            : <>See also our <button className="underline hover:text-ink" onClick={() => onOpen?.("terms")}>Terms of Use</button>.</>}
        </p>
      </article>
    </div>
  );
}
