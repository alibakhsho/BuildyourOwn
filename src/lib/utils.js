import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting later classes win conflicts.
 *
 * `clsx` flattens conditionals; `twMerge` then resolves Tailwind collisions so
 * a caller can override a component's defaults — `<Button className="px-8">`
 * beats the built-in `px-4` instead of producing both and leaving the winner
 * to CSS source order.
 *
 * This is shadcn's exact helper, at the path its components import from.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
