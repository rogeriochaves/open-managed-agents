import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

/* ── Table shell ─────────────────────────────────────────────────────── */

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = "" }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table
        className={`min-w-full divide-y divide-surface-border text-sm ${className}`}
      >
        {children}
      </table>
    </div>
  );
}

/* ── Head ─────────────────────────────────────────────────────────────── */

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-secondary">
      <tr>{children}</tr>
    </thead>
  );
}

export function TableHeadCell({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted ${className}`}
    >
      {children}
    </th>
  );
}

/* ── Body ─────────────────────────────────────────────────────────────── */

export function TableBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-surface-border bg-surface-primary">
      {children}
    </tbody>
  );
}

export function TableRow({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={`hover:bg-surface-hover transition-colors ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 whitespace-nowrap text-text-primary ${className}`}>
      {children}
    </td>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */

export function TableEmpty({
  colSpan,
  title,
  description,
}: {
  colSpan: number;
  title: string;
  description?: ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-text-muted"
      >
        <p className="text-sm font-medium text-text-secondary">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-text-muted">{description}</p>
        )}
      </td>
    </tr>
  );
}

/* ── Pagination ───────────────────────────────────────────────────────── */

interface PaginationProps {
  hasMore: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
}

export function Pagination({
  hasMore,
  hasPrev,
  onNext,
  onPrev,
}: PaginationProps) {
  return (
    <div className="flex items-center justify-end gap-2 py-3">
      <Button
        variant="ghost"
        size="sm"
        disabled={!hasPrev}
        onClick={onPrev}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous page
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!hasMore}
        onClick={onNext}
        aria-label="Next page"
      >
        Next page
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
