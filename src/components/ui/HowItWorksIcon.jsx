/* Line icons for the "how it works" cards, with hi-vis dots picking out the
   active points. Sized and stroked to sit alongside 21px display headings. */
import { colors as TOKENS } from "../../design/system.js";

export default function HowItWorksIcon({ kind }) {
  const common = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: TOKENS.ink, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    config: <><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="8" cy="6" r="2" fill={TOKENS.hivis} /><circle cx="15" cy="12" r="2" fill={TOKENS.hivis} /><circle cx="10" cy="18" r="2" fill={TOKENS.hivis} /></>,
    build: <><path d="M3 21V8l9-5 9 5v13M9 21v-7h6v7" /></>,
    data: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    share: <><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M8.1 11l7.8-4M8.1 13l7.8 4" /></>,
  };
  return <svg {...common}>{paths[kind] || paths.config}</svg>;
}
