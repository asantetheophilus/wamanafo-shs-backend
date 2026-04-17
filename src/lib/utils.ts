// ============================================================
// Wamanafo SHS Backend — Utility Functions
// ============================================================

import { format, parseISO } from "date-fns";

/** Format a date for display */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "dd MMM yyyy");
  } catch {
    return "—";
  }
}

/** Get initials from a full name */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Format display score — "—" for null, 1dp otherwise */
export function formatDisplayScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return score.toFixed(1);
}

/** Simple slug from string */
export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** Check for student status variant */
export function studentStatusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  switch (status) {
    case "ACTIVE":    return "success";
    case "SUSPENDED": return "warning";
    case "WITHDRAWN":
    case "GRADUATED": return "neutral";
    default:          return "neutral";
  }
}
