/* =========================================================================
   StaggerReveal — wraps each child in its own Reveal, offsetting the delay
   so a row or grid arrives one item at a time rather than all at once.
   ========================================================================= */
import { Children } from "react";
import Reveal from "./Reveal.jsx";

export default function StaggerReveal({ children, stagger = 0.08, baseDelay = 0, ...props }) {
  const arr = Children.toArray(children);
  return (
    <>
      {arr.map((child, i) => (
        <Reveal key={i} delay={baseDelay + i * stagger} {...props}>{child}</Reveal>
      ))}
    </>
  );
}
