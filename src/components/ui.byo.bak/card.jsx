import * as React from "react";
import { cn } from "@/lib/utils";

/* Flat, bordered surfaces — the house style is a 1px rule that darkens on
   hover rather than a drop shadow. Radius stays sharp (2px) to match the
   technical-drawing feel of the tables and takeoff canvas. */

export const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-sm border border-rule bg-card text-ink",
      "transition-colors duration-200",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1 p-4", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-display text-lg leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-xs leading-relaxed text-steel", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";
