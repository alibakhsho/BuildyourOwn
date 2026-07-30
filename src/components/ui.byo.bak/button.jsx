import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* Note `hivis` uses text-on-hivis, not text-ink. Safety yellow is a light
   colour in BOTH themes, so its label stays near-black — using text-ink would
   flip to near-white in dark mode and give yellow-on-white. */

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm",
    "font-display uppercase tracking-wide transition-colors cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hivis-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/90",
        hivis: "bg-hivis text-on-hivis hover:bg-hivis-deep",
        ghost: "border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper",
        outline: "border border-rule bg-card text-ink-soft hover:border-ink hover:text-ink",
        danger: "border border-alert bg-transparent text-alert hover:bg-alert hover:text-paper",
        subtle: "bg-transparent text-steel hover:text-ink",
      },
      size: {
        sm: "h-7 px-2.5 text-[11px]",
        default: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // asChild renders the caller's element with these styles instead of a
    // <button> — the standard escape hatch for wrapping links.
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
