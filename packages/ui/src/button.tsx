import * as React from "react";

import { cn } from "./utils";

export type ButtonVariant =
  | "default"
  | "outline"
  | "ghost"
  | "destructive"
  | "secondary";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40",
  outline:
    "border border-border bg-background hover:bg-muted hover:text-foreground",
  ghost: "hover:bg-muted hover:text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-3 text-sm",
  sm: "h-8 px-2.5 text-xs",
  lg: "h-10 px-4 text-sm",
  icon: "size-9",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
