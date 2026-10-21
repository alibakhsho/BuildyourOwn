/* =========================================================================
   COMPONENT: ContractDialog
   "Contract signed" — record a signed build contract and show the 1.5%
   platform fee it carries. Used from a marketplace enquiry and from a Site
   Office job. The database works out the fee; this previews it.
   Edits an existing record when `initial.id` is set (within 14 days, while
   it's still only "recorded" — the database enforces the window).
   ========================================================================= */

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../state/auth.jsx";
import * as MK from "../state/marketplace.js";
import { contractProblems, feePreviewCents, dollars, localDate, PLATFORM_FEES } from "../logic/marketplace.js";
import { track } from "../lib/analytics.js";

const today = () => localDate();

export default function ContractDialog({ initial = {}, link = {}, context, onClose, onSaved }) {
  const { user } = useAuth();
  const [c, setC] = useState(() => ({
    clientName: initial.clientName || "",
    valueCents: Number.isInteger(initial.valueCents) && initial.valueCents > 0 ? initial.valueCents : null,
    sitePostcode: initial.sitePostcode || "",
    signedOn: initial.signedOn || today(),
    notes: initial.notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const problems = contractProblems(c);
  const editing = !!initial.id;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e) => {
    e.preventDefault();
    if (problems.length) { setError(problems[0]); return; }
    setBusy(true); setError("");
    try {
      const saved = editing ? await MK.updateContract(initial.id, c) : await MK.recordContract(user.id, c, link);
      if (!editing) track("contract_recorded", { source: link.source || "other" });
      onSaved?.(saved);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label="Contract signed">
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto border border-rule bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-steel">{editing ? "Correct the record" : "Contract signed"}</div>
            <h3 className="font-display text-xl leading-tight text-ink">{editing ? "Contract details" : "Record the signed contract"}</h3>
            {context && <p className="mt-1 text-xs text-steel">{context}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-steel hover:text-ink"><X className="size-4" /></button>
        </div>

        {!user ? (
          <p className="text-sm text-ink-soft">Sign in to record a contract — it's kept against your account.</p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-steel">Client</span>
              <input className="ec-input w-full" required maxLength={160} value={c.clientName} onChange={(e) => set("clientName", e.target.value)} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-steel">Contract value (A$)</span>
                <input className="ec-input w-full" type="number" min="1" step="1" required inputMode="decimal"
                  value={c.valueCents ? c.valueCents / 100 : ""}
                  onChange={(e) => set("valueCents", e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))} />
                <span className="mt-0.5 block text-[10px] text-steel">Ex GST</span>
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-steel">Signed on</span>
                <input className="ec-input w-full" type="date" required max={today()} value={c.signedOn} onChange={(e) => set("signedOn", e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-steel">Site postcode</span>
                <input className="ec-input w-full" inputMode="numeric" pattern="\d{4}" maxLength={4} value={c.sitePostcode} onChange={(e) => set("sitePostcode", e.target.value)} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-steel">Notes (optional)</span>
              <input className="ec-input w-full" maxLength={2000} value={c.notes} onChange={(e) => set("notes", e.target.value)} />
            </label>

            <div className="flex items-center justify-between gap-3 border border-rule bg-paper-light px-3 py-2.5">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-steel">Platform fee · {PLATFORM_FEES.contract.label}</div>
                <div className="text-[11px] text-steel">Ex GST. Invoiced separately — nothing is charged now.</div>
              </div>
              <div className="font-mono text-lg font-bold tabular-nums text-ink">{dollars(feePreviewCents(c.valueCents))}</div>
            </div>

            {error && <p className="text-xs text-alert">{error}</p>}
            <p className="text-[11px] text-steel">
              {editing ? "You can correct or void a record for 14 days, until it's invoiced." : "By recording it you confirm this contract came through BuildYourOwn. You can correct it for 14 days."}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="hivis" disabled={busy || problems.length > 0}>{busy ? "Saving…" : editing ? "Save" : "Record contract"}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
