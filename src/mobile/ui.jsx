/* =========================================================================
   mobile/ui.jsx — the phone app's controls
   Steppers, chips, switches and sheets instead of sliders and dropdowns:
   big targets, one thumb, no precision dragging.
   ========================================================================= */
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useBackClose } from "../lib/back-stack.js";
import { currencySymbol } from "../lib/format.js";

/** A$457,582 — whole dollars, the region's symbol. */
export function money(n, region = "AU") {
  return `${currencySymbol(region)}${Math.round(n || 0).toLocaleString("en-AU")}`;
}
/** A$458k / A$1.2m — for cards where the full figure won't fit. */
export function moneyShort(n, region = "AU") {
  const c = currencySymbol(region);
  if (n >= 1e6) return `${c}${(n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/\.?0+$/, "")}m`;
  return `${c}${Math.round(n / 1000)}k`;
}
/** The price a person pays: the estimate plus GST/VAT where it applies. */
export const grossTotal = (e) => (e?.total || 0) * (1 + (e?.taxRate || 0));

export function Stepper({ label, hint, value, min, max, step = 1, unit = "", onChange }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <div className="m-control">
      <div><span className="m-control-label">{label}</span>{hint && <span className="m-control-hint">{hint}</span>}</div>
      <div className="m-stepper" role="group" aria-label={label}>
        <button className="m-step-btn" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => set(value - step)}><Minus size={18} /></button>
        <span className="m-step-val m-num" aria-live="polite">{value}{unit}</span>
        <button className="m-step-btn" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => set(value + step)}><Plus size={18} /></button>
      </div>
    </div>
  );
}

export function Chips({ label, options, value, onChange }) {
  return (
    <div>
      <div className="m-control-label" style={{ paddingTop: 12 }}>{label}</div>
      <div className="m-chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} className="m-chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Switch({ label, hint, checked, onChange }) {
  return (
    <div className="m-control">
      <div><span className="m-control-label">{label}</span>{hint && <span className="m-control-hint">{hint}</span>}</div>
      <button className="m-switch" role="switch" aria-checked={!!checked} aria-label={label} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="m-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/** A bottom sheet. Android Back and Escape close it. */
export function Sheet({ title, onClose, children }) {
  useBackClose(onClose);
  return (
    <div className="m-scrim" onClick={onClose}>
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-grip" />
        {title && <h2 className="m-sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** One short message at a time, gone after a few seconds. */
export function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text) => {
    setMsg(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = msg ? <div className="m-toast" role="status">{msg}</div> : null;
  return [node, show];
}
