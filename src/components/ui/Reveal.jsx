/* =========================================================================
   Reveal — fades/slides children in when they scroll into view.
   Honours prefers-reduced-motion by showing immediately rather than
   animating, so the content is never gated behind an animation a user has
   asked not to see.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";

export default function Reveal({
  children, variant = "fade-up", delay = 0, duration = 0.7, threshold = 0.15,
  once = true, className = "", style = {}, as: Tag = "div",
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respect users with reduced motion preference — show immediately
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        if (once) obs.disconnect();
      } else if (!once) {
        setVisible(false);
      }
    }, { threshold, rootMargin: "0px 0px -40px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);

  const variants = {
    "fade-up": { initial: "translate3d(0, 28px, 0)", final: "translate3d(0, 0, 0)" },
    "fade-in": { initial: "translate3d(0, 0, 0)", final: "translate3d(0, 0, 0)" },
    "scale-up": { initial: "scale(0.96)", final: "scale(1)" },
    "slide-left": { initial: "translate3d(-32px, 0, 0)", final: "translate3d(0, 0, 0)" },
    "slide-right": { initial: "translate3d(32px, 0, 0)", final: "translate3d(0, 0, 0)" },
  };
  const v = variants[variant] || variants["fade-up"];

  return (
    <Tag ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? v.final : v.initial,
      transition: `opacity ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      willChange: "opacity, transform",
      ...style,
    }}>
      {children}
    </Tag>
  );
}
