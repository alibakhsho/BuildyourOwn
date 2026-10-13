/* =========================================================================
   CountUp — animates a number from 0 to its target the first time it scrolls
   into view. On a construction estimator this reads as the estimate
   assembling itself, which is exactly what the product does.

   No animation library: one IntersectionObserver to trigger, one rAF loop to
   tween with an ease-out so it decelerates into the final figure. Honours
   prefers-reduced-motion by showing the final value immediately.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";

export default function CountUp({
  to, duration = 1600, prefix = "", suffix = "", decimals = 0, className, style,
}) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setValue(to); return; }

    let settle;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return;
      started.current = true;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        // easeOutCubic — fast start, gentle landing on the real number.
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(to * eased);
        if (p < 1) requestAnimationFrame(tick);
        else setValue(to);
      };
      requestAnimationFrame(tick);
      // Safety net: rAF is paused while a tab is backgrounded, which could
      // leave the number stuck at 0. This timer still fires there and forces
      // the final value, so the figure is always correct even if it didn't
      // get to animate. When rAF ran normally this is a harmless re-set.
      settle = setTimeout(() => setValue(to), duration + 120);
    }, { threshold: 0.4 });

    obs.observe(el);
    return () => { obs.disconnect(); if (settle) clearTimeout(settle); };
  }, [to, duration]);

  const shown = value.toLocaleString("en-AU", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {prefix}{shown}{suffix}
    </span>
  );
}
