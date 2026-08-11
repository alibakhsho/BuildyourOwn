/* On/off button for spec options (garage, solar). Fills with ink when on —
   `paper` as the foreground is correct in both themes because both tokens
   flip together. */
import { colors as TOKENS } from "../../design/system.js";

export default function Toggle({ label, value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{
        flex: 1, padding: "8px 10px", border: `1px solid ${value ? TOKENS.ink : TOKENS.rule}`,
        background: value ? TOKENS.ink : TOKENS.paperLight,
        color: value ? TOKENS.paper : TOKENS.ink,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em",
        textTransform: "uppercase", cursor: "pointer",
      }}>
      {value ? "✓ " : ""}{label}
    </button>
  );
}
