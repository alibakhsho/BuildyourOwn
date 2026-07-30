import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-rule bg-paper-light text-ink-soft",
        emphasis: "border-emphasis bg-emphasis text-on-emphasis",
        hivis: "border-hivis bg-hivis text-on-hivis",
        ok: "border-ok bg-ok text-card",
        alert: "border-alert bg-alert text-card",
        outline: "border-rule bg-transparent text-steel",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
