import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A budget bar. Not the Radix progress primitive, because this needs to show
 * an *overrun* — a trade at 130% of budget is the single most important thing
 * on the dashboard, and a component that clamps at 100% would hide exactly
 * the case the builder needs to see.
 *
 * The fill is clamped for layout, but the `over` state recolours the whole
 * bar so the overrun reads at a glance.
 */
export function Progress({ value = 0, className, barClassName, ...props }) {
  const pct = Number.isFinite(value) ? value : 0;
  const over = pct > 100;
  const width = Math.max(0, Math.min(100, pct));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-paper-light", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full transition-[width] duration-500 ease-out",
          over ? "bg-alert" : "bg-hivis-deep",
          barClassName
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
