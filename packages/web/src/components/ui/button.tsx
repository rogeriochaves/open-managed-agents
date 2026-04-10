import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-orange-500 hover:bg-orange-600 text-white shadow-sm",
  secondary:
    "bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 shadow-sm",
  outline:
    "bg-transparent hover:bg-gray-100 text-gray-700 border border-gray-300",
  ghost:
    "bg-transparent hover:bg-gray-100 text-gray-700",
  danger:
    "bg-red-500 hover:bg-red-600 text-white shadow-sm",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs h-8",
  md: "px-4 py-2 text-sm h-9",
  lg: "px-5 py-2.5 text-sm h-10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
