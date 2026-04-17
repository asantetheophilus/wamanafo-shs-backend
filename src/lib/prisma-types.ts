// ============================================================
// Wamanafo SHS — Shared Prisma Transaction Type
// ============================================================

import { PrismaClient } from "@prisma/client";

// Safe way to type the $transaction callback parameter
// without relying on generated internals
export type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v);
  if (typeof v === "object" && v !== null && "toNumber" in v)
    return (v as { toNumber(): number }).toNumber();
  return Number(v);
}

export function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return toNum(v);
}
