// ============================================================
// Wamanafo SHS — Bulk Student Import Service
// Supports Excel (.xlsx) and CSV (.csv) files.
// ============================================================

import * as XLSX from "xlsx";
import { db }   from "../lib/db";
import { hashPassword } from "../lib/auth";
import { buildPasswordSchema } from "../lib/password-policy";

export interface ImportRow {
  firstName:   string;
  lastName:    string;
  email:       string;
  indexNumber: string;
  gender?:     string;
  dateOfBirth?: string;
  className?:  string;
}

export interface ImportRowResult {
  row:     number;
  status:  "success" | "failed" | "skipped";
  data:    ImportRow;
  reason?: string;
}

export interface ImportSummary {
  total:    number;
  success:  number;
  failed:   number;
  skipped:  number;
  results:  ImportRowResult[];
}

const VALID_GENDERS = ["male", "female", "other"];

function normaliseGender(g?: string): string | undefined {
  if (!g) return undefined;
  const n = g.trim().toLowerCase();
  if (!VALID_GENDERS.includes(n)) return undefined;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function parseDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  if (d > new Date()) return undefined;
  return d;
}

/** Parse raw buffer into rows regardless of xlsx/csv */
export function parseImportFile(
  buffer: Buffer,
  mimetype: string
): ImportRow[] {
  const type = mimetype.includes("csv") ? "csv" : "xlsx";
  const wb   = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval:    "",
    raw:       false,
    dateNF:    "yyyy-mm-dd",
  });

  return rows.map((r) => ({
    firstName:   String(r["First Name"]   ?? r["firstName"]   ?? r["first_name"]   ?? "").trim(),
    lastName:    String(r["Last Name"]    ?? r["lastName"]    ?? r["last_name"]    ?? "").trim(),
    email:       String(r["Email"]        ?? r["email"]                             ?? "").trim().toLowerCase(),
    indexNumber: String(r["Index Number"] ?? r["indexNumber"] ?? r["index_number"] ?? "").trim(),
    gender:      String(r["Gender"]       ?? r["gender"]                            ?? "").trim(),
    dateOfBirth: String(r["Date of Birth"]?? r["dateOfBirth"] ?? r["date_of_birth"] ?? "").trim(),
    className:   String(r["Class"]        ?? r["class"]       ?? r["className"]     ?? "").trim(),
  }));
}

/** Validate a single row, return error string or null */
function validateRow(row: ImportRow): string | null {
  if (!row.firstName) return "First name is required.";
  if (!row.lastName)  return "Last name is required.";
  if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
    return "Valid email is required.";
  if (!row.indexNumber) return "Index number is required.";
  if (row.gender && !VALID_GENDERS.includes(row.gender.toLowerCase()))
    return `Invalid gender "${row.gender}" — use Male, Female, or Other.`;
  if (row.dateOfBirth && isNaN(new Date(row.dateOfBirth).getTime()))
    return `Invalid date of birth "${row.dateOfBirth}".`;
  return null;
}

const DEFAULT_PASSWORD = "WamSHS@2024";   // forced to change on first login

export async function bulkImportStudents(
  schoolId: string,
  rows:     ImportRow[]
): Promise<ImportSummary> {
  const results: ImportRowResult[] = [];
  let success = 0, failed = 0, skipped = 0;

  // Pre-load existing index numbers and emails for duplicate checking
  const [existingIndexes, existingEmails] = await Promise.all([
    db.student.findMany({ where: { schoolId }, select: { indexNumber: true } }),
    db.user.findMany({ where: { schoolId }, select: { email: true } }),
  ]);
  const indexSet = new Set(existingIndexes.map((s) => s.indexNumber));
  const emailSet = new Set(existingEmails.map((u) => u.email));

  // Load classes for mapping
  const classes = await db.class.findMany({
    where:  { schoolId },
    select: { id: true, name: true },
  });
  const classMap = new Map(classes.map((c) => [c.name.toLowerCase().trim(), c.id]));

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    // Validate
    const err = validateRow(row);
    if (err) {
      results.push({ row: rowNum, status: "failed", data: row, reason: err });
      failed++;
      continue;
    }

    // Duplicate checks
    if (indexSet.has(row.indexNumber)) {
      results.push({ row: rowNum, status: "skipped", data: row, reason: `Student with index number "${row.indexNumber}" already exists.` });
      skipped++;
      continue;
    }
    if (emailSet.has(row.email)) {
      results.push({ row: rowNum, status: "skipped", data: row, reason: `Email "${row.email}" is already registered.` });
      skipped++;
      continue;
    }

    try {
      const classId = row.className ? classMap.get(row.className.toLowerCase()) : undefined;
      const dob     = parseDate(row.dateOfBirth);
      const gender  = normaliseGender(row.gender);

      await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email:        row.email,
            passwordHash,
            role:         "STUDENT",
            schoolId,
            firstName:    row.firstName,
            lastName:     row.lastName,
          },
        });

        await tx.student.create({
          data: {
            schoolId,
            indexNumber: row.indexNumber,
            userId:      user.id,
            dateOfBirth: dob,
            gender,
            status:      "ACTIVE",
          },
        });
      });

      indexSet.add(row.indexNumber);
      emailSet.add(row.email);
      results.push({ row: rowNum, status: "success", data: row });
      success++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Database error.";
      results.push({ row: rowNum, status: "failed", data: row, reason: msg });
      failed++;
    }
  }

  return { total: rows.length, success, failed, skipped, results };
}

/** Build a sample import template as an XLSX Buffer */
export function buildImportTemplate(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["First Name","Last Name","Email","Index Number","Gender","Date of Birth","Class"],
    ["Kwame","Mensah","kwame.mensah@student.edu.gh","WAS/001/2024","Male","2005-03-15","Form 1A"],
    ["Abena","Asante","abena.asante@student.edu.gh","WAS/002/2024","Female","2006-07-22","Form 1A"],
  ]);
  ws["!cols"] = [18,18,30,16,10,14,12].map((w) => ({ wch: w }));
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
