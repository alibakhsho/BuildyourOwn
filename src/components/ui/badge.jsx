import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* Both variant sets, for the same reason as Button — registry components ask
   for `secondary`/`destructive`, the app asks for `emphasis`/`hivis`/`ok`. */
const badgeVariants = cva(
  cn(
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap",
    "rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]",
    "[&>svg]:pointer-events-none [&>svg]:size-3"
  ),
  {
    variants: {
      variant: {
        // shadcn-compatible
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-rule bg-transparent text-steel",
        ghost: "border-transparent bg-transparent text-steel",
        // house
        emphasis: "border-emphasis bg-emphasis text-on-emphasis",
        hivis: "border-hivis bg-hivis text-on-hivis",
        ok: "border-ok bg-ok text-card",
        alert: "border-alert bg-alert text-card",
        muted: "border-rule bg-paper-light text-ink-soft",
      },
    },
    defaultVariants: { variant: "muted" },
  }
);

export function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
