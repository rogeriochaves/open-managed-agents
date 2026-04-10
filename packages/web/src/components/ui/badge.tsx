import type { ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "active"
  | "idle"
  | "running"
  | "terminated"
  | "rescheduling"
  | "new"
  | "info";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "bg-gray-100 text-gray-700 border border-gray-200",
  active:
    "bg-green-50 text-green-700 border border-green-200",
  idle:
    "bg-gray-100 text-gray-500 border border-gray-200",
  running:
    "bg-yellow-50 text-yellow-700 border border-yellow-200",
  terminated:
    "bg-red-50 text-red-700 border border-red-200",
  rescheduling:
    "bg-orange-50 text-orange-700 border border-orange-200",
  new:
    "bg-orange-50 text-orange-700 border border-orange-200",
  info:
    "bg-blue-50 text-blue-700 border border-blue-200",
};

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Map a status string to a badge variant. */
export function statusVariant(
  status: string,
): BadgeVariant {
  switch (status) {
    case "active":
      return "active";
    case "running":
      return "running";
    case "idle":
      return "idle";
    case "terminated":
      return "terminated";
    case "rescheduling":
      return "rescheduling";
    default:
      return "default";
  }
}
