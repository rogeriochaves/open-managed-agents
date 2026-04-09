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
  default: "bg-surface-hover text-text-secondary",
  active: "bg-green-900/40 text-green-400 border border-green-800/50",
  idle: "bg-gray-800/40 text-gray-400 border border-gray-700/50",
  running: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/50",
  terminated: "bg-red-900/40 text-red-400 border border-red-800/50",
  rescheduling:
    "bg-amber-900/40 text-amber-400 border border-amber-800/50",
  new: "bg-accent-blue/20 text-accent-blue border border-accent-blue/30",
  info: "bg-purple-900/40 text-purple-400 border border-purple-800/50",
};

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
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
