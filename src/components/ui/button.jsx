import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Carries BOTH variant sets on purpose:
 *   - shadcn's (default / secondary / outline / ghost / link / destructive),
 *     so anything pasted from the registry renders correctly;
 *   - the house set (hivis / danger / subtle), which the app itself uses.
 *
 * Dropping either half breaks something silently — registry components fall
 * back to unstyled, or every `variant="hivis"` in the app quietly renders as
 * a plain dark button. Keeping the union is cheaper than auditing call sites
 * every time a block is installed.
 *
 * `text-on-hivis`, not `text-ink`: safety yellow is a light colour in both
 * themes, so its label stays near-black. `text-ink` would flip to near-white
 * in dark mode and give yellow-on-white.
 */
const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm",
    "font-display uppercase tracking-wide transition-colors cursor-pointer outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        // shadcn-compatible
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-rule bg-card text-ink-soft hover:border-ink hover:text-ink",
        ghost: "border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper",
        link: "text-primary underline-offset-4 hover:underline",
        destructive: "border border-alert bg-transparent text-alert hover:bg-alert hover:text-paper",
        // house
        hivis: "bg-hivis text-on-hivis hover:bg-hivis-deep",
        danger: "border border-alert bg-transparent text-alert hover:bg-alert hover:text-paper",
        subtle: "bg-transparent text-steel hover:text-ink",
      },
      size: {
        xs: "h-6 gap-1 px-2 text-[10px]",
        sm: "h-7 px-2.5 text-[11px]",
        default: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-base",
        icon: "size-9",
        "icon-sm": "size-7",
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
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
