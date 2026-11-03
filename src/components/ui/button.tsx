import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Variantes según docs/design-system.md §8. El foco usa el outline global
// (2px, ring a opacidad completa) definido en globals.css.
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium",
    "transition-colors duration-150 ease-out select-none",
    "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-subtle-foreground",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-dark",
        secondary:
          "border border-input bg-background text-foreground hover:bg-accent active:bg-secondary",
        ghost: "text-foreground hover:bg-accent active:bg-secondary",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-strong active:bg-destructive-strong",
      },
      size: {
        default: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
