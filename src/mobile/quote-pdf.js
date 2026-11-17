/* =========================================================================
   MODULE: mobile/quote-pdf.js — the estimate as a PDF, sent from the phone
   ------------------------------------------------------------------------
   The full app prints its proposal through the browser, but a phone's
   in-app browser has no print. Here the PDF is drawn directly (jsPDF,
   loaded only when someone taps Share) and handed to the phone's share
   sheet: Capacitor Share in the app, the Web Share API in a phone browser,
   a download anywhere else.
   ========================================================================= */
import { isNative } from "../lib/native.js";
import { houseSummary } from "./house.js";

const INK = [31, 28, 26], SOFT = [98, 90, 82], RULE = [226, 217, 203], CORAL = [232, 87, 78], LILAC = [189, 174, 221];

const money = (n, cur) => `${cur}${Math.round(n || 0).toLocaleString("en-AU")}`;

async function logoDataUrl() {
  try {
    const blob = await (await fetch("/logo-mark.png")).blob();
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  } catch { return null; }
}

/** Build the PDF. Returns { blob, filename }. */
export async function buildQuotePdf({ name, spec, estimate, region, currency, client, preparedBy, notes, ref }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18, R = W - M;
  let y = M;
  const gross = estimate.total * (1 + (estimate.taxRate || 0));
  const tax = gross - estimate.total;
  const date = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const text = (s, x, yy, opts = {}) => { doc.text(String(s), x, yy, opts); };
  const font = (size, style = "normal", color = INK) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color); };
  const rule = (yy) => { doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, yy, R, yy); };
  const ensure = (h) => { if (y + h > 280) { doc.addPage(); y = M; } };

  // header
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, "PNG", M, y - 2, 14, 14);
  font(11, "bold"); text("Build Your Own", M + (logo ? 17 : 0), y + 4);
  font(8.5, "normal", SOFT); text("buildyourown.dev", M + (logo ? 17 : 0), y + 9);
  font(8.5, "normal", SOFT); text(`Estimate ${ref}`, R, y + 4, { align: "right" }); text(date, R, y + 9, { align: "right" });
  y += 22;

  font(22, "bold"); text(name || "My build", M, y); y += 7;
  font(10.5, "normal", SOFT); text(houseSummary(spec), M, y); y += 10;

  // who
  font(8.5, "bold", SOFT);
  text("PREPARED FOR", M, y); text("PREPARED BY", W / 2, y); y += 5;
  font(10.5, "normal");
  const half = W / 2 - M - 4;
  const who = [doc.splitTextToSize(client || "-", half).slice(0, 2), doc.splitTextToSize(preparedBy || "-", half).slice(0, 2)];
  text(who[0].join("\n"), M, y); text(who[1].join("\n"), W / 2, y);
  y += 5 * Math.max(who[0].length, who[1].length) + 5;

  // the price
  doc.setFillColor(...CORAL); doc.roundedRect(M, y, R - M, 26, 3, 3, "F");
  font(9, "bold", INK); text(`ESTIMATED TOTAL${estimate.taxRate > 0 ? ` INCL. ${estimate.taxLabel.split(" ")[0]}` : ""}`, M + 6, y + 8);
  font(22, "bold", INK); text(money(gross, currency), M + 6, y + 19);
  font(9, "normal", INK);
  text(`${money(estimate.total, currency)} before ${estimate.taxRate > 0 ? estimate.taxLabel.split(" ")[0] : "tax"}`, R - 6, y + 11, { align: "right" });
  text(`${money(estimate.ratePerM2 * (1 + (estimate.taxRate || 0)), currency)}/m² · ${estimate.timeline?.totalWeeks || 0} weeks to build`, R - 6, y + 18, { align: "right" });
  y += 36;

  const table = (title, rows, { total } = {}) => {
    ensure(14 + Math.min(rows.length, 4) * 7); // start here if a few rows fit; the rest flow onto the next page
    font(12, "bold"); text(title, M, y); y += 5; rule(y); y += 6;
    for (const [label, value, sub] of rows) {
      ensure(8);
      font(10, "normal"); text(label, M, y);
      if (sub) { font(8.5, "normal", SOFT); text(sub, M + 95, y); }
      font(10, "normal"); text(value, R, y, { align: "right" });
      y += 6.5;
    }
    if (total) { rule(y - 2.5); y += 3; font(10.5, "bold"); text(total[0], M, y); text(total[1], R, y, { align: "right" }); y += 6; }
    y += 6;
  };

  const e = estimate;
  table("Where the money goes", [
    ["Materials (with waste)", money(e.materialsTotal, currency)],
    ["Labour, all trades", money(e.labourTotal, currency)],
    ["Equipment and site", money(e.equipmentTotal, currency)],
    [`Preliminaries (${Math.round(e.prelimsPct * 100)}%)`, money(e.prelims, currency), "site setup, supervision, insurance"],
    ["Builder's margin (15%)", money(e.margin, currency)],
    [`Contingency (${Math.round(e.contingencyPct * 100)}%)`, money(e.contingency, currency)],
    ...(e.extrasTotal > 0 ? [["Extra items", money(e.extrasTotal, currency)]] : []),
    ...(e.landscapeTotal > 0 ? [["Landscaping", money(e.landscapeTotal, currency)]] : []),
    ...(tax > 0 ? [[e.taxLabel, money(tax, currency)]] : []),
  ], { total: ["Total", money(gross, currency)] });

  table("Labour by trade", e.labourLines.map((l) => [l.trade, money(l.total, currency)]));

  const stages = e.timeline?.stages || [];
  if (stages.length) table("Build programme", stages.map((s) => [s.name, `${s.weeks} wk`, `weeks ${s.startWeek}-${s.endWeek}`]));

  const top = [...e.materialLines].sort((a, b) => b.total - a.total).slice(0, 15);
  table("Largest material items", top.map((l) => [l.label.length > 48 ? l.label.slice(0, 46) + "..." : l.label, money(l.total, currency), `${Math.round(l.qty * 10) / 10} ${l.unit}`]));

  if (notes) {
    ensure(20);
    font(12, "bold"); text("Notes", M, y); y += 6;
    font(10, "normal");
    for (const line of doc.splitTextToSize(notes, R - M)) { ensure(5); text(line, M, y); y += 5; } // long notes run onto the next page
    y += 6;
  }

  font(8.5, "normal", SOFT);
  const fine = `This is an indicative estimate from Build Your Own's ${region} rates (November 2026), worked out from the house described above. It is not a fixed-price quote or a contract. It doesn't include land, council, certifier or engineering fees, demolition, or anything specific to the site that isn't listed. Get written quotes from licensed builders before you commit.`;
  const fl = doc.splitTextToSize(fine, R - M - 6);
  ensure(fl.length * 4 + 8);
  doc.setFillColor(...LILAC); doc.rect(M, y, 1.2, fl.length * 3.7 + 3, "F");
  text(fl.join("\n"), M + 5, y + 4);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font(8, "normal", SOFT);
    text(`Made with Build Your Own · buildyourown.dev`, M, 290);
    text(`${i} / ${pages}`, R, 290, { align: "right" });
  }

  const safe = (name || "estimate").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "estimate";
  return { blob: doc.output("blob"), filename: `${safe}-estimate.pdf` };
}

const toBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/** Make the PDF and open the share sheet. Returns "shared" | "downloaded" | "cancelled". */
export async function shareQuotePdf(args) {
  const { blob, filename } = await buildQuotePdf(args);
  const title = `${args.name || "My build"}: estimate`;
  try {
    if (isNative) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
      // earlier estimates hold client names and prices: don't leave them piling up in the cache
      try {
        const { files } = await Filesystem.readdir({ path: "", directory: Directory.Cache });
        await Promise.all(files.filter((f) => /-estimate\.pdf$/.test(f.name) && f.name !== filename)
          .map((f) => Filesystem.deleteFile({ path: f.name, directory: Directory.Cache }).catch(() => {})));
      } catch { /* nothing to tidy */ }
      const saved = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
      await Share.share({ title, text: title, files: [saved.uri], dialogTitle: "Send the estimate" });
      return "shared";
    }
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return "shared";
    }
  } catch (e) {
    if (e?.name === "AbortError" || /cancel/i.test(e?.message || "")) return "cancelled";
    throw e;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
