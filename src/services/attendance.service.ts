/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// Wamanafo SHS — Attendance Service
// Key rules:
//  - Denominator = Term.totalSchoolDays, NOT markedDays.
//  - PRESENT + LATE count toward attendance percentage.
//  - Missing records ≠ PRESENT.
//  - Bulk saves use createMany for performance.
// ============================================================

import { db } from "../lib/db";
import { logger } from "../lib/logger";
import { computeAttendanceSummary, isBelowThreshold } from "../lib/attendance";
import { ATTENDANCE_WARNING_THRESHOLD_PERCENT } from "../lib/constants";
import { AttendanceStatus } from "../lib/enums";
import type { BulkMarkAttendanceInput, AttendanceQueryInput } from "../validators/attendance";
import type { AttendanceGridRow, AttendanceSummaryRow, AttendanceRecordDTO } from "../types/attendance";

// ── Get attendance grid for a class on a specific date ───────

export async function getAttendanceGrid(
  schoolId: string,
  classId: string,
  termId: string,
  date: string   // YYYY-MM-DD
): Promise<AttendanceGridRow[]> {
  // Verify class belongs to school
  const cls = await db.class.findFirst({
    where: { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  // Verify term belongs to school (via year)
  const term = await db.term.findFirst({
    where: { id: termId, year: { schoolId } },
    select: { id: true },
  });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });

  // Get all enrolled students for this class/year
  const enrollments = await db.classEnrollment.findMany({
    where: { classId, yearId: cls.yearId },
    select: {
      student: {
        select: {
          id:          true,
          indexNumber: true,
          status:      true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { student: { user: { lastName: "asc" } } },
  });

  // Get existing records for this date
  const targetDate = new Date(date);
  const existing = await db.attendanceRecord.findMany({
    where: {
      classId,
      termId,
      date: targetDate,
      studentId: { in: (enrollments as Array<{ student: { id: string } }>).map((e) => e.student.id) },
    },
    select: { id: true, studentId: true, status: true, note: true },
  });

  type ExistingRec = { id: string; studentId: string; status: string; note: string | null };
  const recordMap = new Map((existing as ExistingRec[]).map((r) => [r.studentId, r]));

  // Only include ACTIVE students in the grid
  type EnrollRow = { student: { id: string; indexNumber: string; status: string; user: { firstName: string; lastName: string } } };
  return (enrollments as EnrollRow[])
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => {
      const record = recordMap.get(e.student.id);
      return {
        studentId:   e.student.id,
        indexNumber: e.student.indexNumber,
        firstName:   e.student.user.firstName,
        lastName:    e.student.user.lastName,
        status:      (record?.status ?? null) as import("../lib/enums").AttendanceStatus | null,
        note:        record?.note ?? null,
        recordId:    record?.id ?? null,
      };
    });
}

// ── Bulk mark attendance ──────────────────────────────────────

export async function bulkMarkAttendance(
  schoolId: string,
  actorId: string,
  input: BulkMarkAttendanceInput
): Promise<{ saved: number; warnings: string[] }> {
  const { classId, termId, date, records } = input;

  // Verify class and term belong to school
  const cls = await db.class.findFirst({
    where: { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const term = await db.term.findFirst({
    where: { id: termId, year: { schoolId } },
    select: { id: true, totalSchoolDays: true },
  });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });

  const targetDate = new Date(date);

  // Upsert each record — use transaction for atomicity
  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    for (const record of records) {
      await tx.attendanceRecord.upsert({
        where: { studentId_date: { studentId: record.studentId, date: targetDate } },
        create: {
          studentId: record.studentId,
          classId,
          termId,
          date:      targetDate,
          status:    record.status,
          note:      record.note ?? null,
          markedBy:  actorId,
        },
        update: {
          status:   record.status,
          note:     record.note ?? null,
          markedBy: actorId,
        },
      });
    }
  });

  logger.info("attendance.marked", {
    userId: actorId, schoolId,
    resource: `class:${classId}`,
    result: "success",
    meta: { date, termId, count: records.length },
  });

  // Check for students below attendance threshold and send SMS warnings
  const warnings: string[] = [];
  const summaries = await getAttendanceSummaries(schoolId, classId, termId);
  for (const s of summaries) {
    if (isBelowThreshold(s.attendancePercentage, ATTENDANCE_WARNING_THRESHOLD_PERCENT)) {
      warnings.push(s.studentId);
      // Non-blocking SMS to parent
      if (s.attendancePercentage !== null) {
        void import("./sms.service").then(({ notifyAttendanceWarning }) =>
          notifyAttendanceWarning(schoolId, s.studentId, s.attendancePercentage!)
        );
      }
    }
  }

  return { saved: records.length, warnings };
}

// ── Attendance summaries for a class/term ────────────────────

export async function getAttendanceSummaries(
  schoolId: string,
  classId: string,
  termId: string
): Promise<AttendanceSummaryRow[]> {
  const cls = await db.class.findFirst({
    where: { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const term = await db.term.findFirst({
    where: { id: termId, year: { schoolId } },
    select: { totalSchoolDays: true },
  });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });

  // Fetch all students enrolled in this class
  const enrollments = await db.classEnrollment.findMany({
    where: { classId, yearId: cls.yearId },
    select: {
      student: {
        select: {
          id:          true,
          indexNumber: true,
          status:      true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { student: { user: { lastName: "asc" } } },
  });

  // Fetch all attendance records for this class+term in one query (avoids N+1)
  const allRecords = await db.attendanceRecord.findMany({
    where: { classId, termId },
    select: { studentId: true, status: true },
  });

  // Group records by studentId
  const recordsByStudent = new Map<string, Array<{ status: AttendanceStatus }>>();
  for (const rec of allRecords) {
    const existing = recordsByStudent.get(rec.studentId) ?? [];
    existing.push({ status: rec.status });
    recordsByStudent.set(rec.studentId, existing);
  }

  type EnrollRow = { student: { id: string; indexNumber: string; status: string; user: { firstName: string; lastName: string } } };
  return (enrollments as EnrollRow[])
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => {
      const records = recordsByStudent.get(e.student.id) ?? [];
      const summary = computeAttendanceSummary(records, term.totalSchoolDays);
      return {
        studentId:            e.student.id,
        indexNumber:          e.student.indexNumber,
        firstName:            e.student.user.firstName,
        lastName:             e.student.user.lastName,
        presentCount:         summary.presentCount,
        lateCount:            summary.lateCount,
        absentCount:          summary.absentCount,
        excusedCount:         summary.excusedCount,
        attendancePercentage: summary.attendancePercentage,
        daysAbsent:           summary.daysAbsent,
      };
    });
}

// ── Get attendance records (paginated) ───────────────────────

export async function listAttendanceRecords(
  schoolId: string,
  query: AttendanceQueryInput
): Promise<{ items: AttendanceRecordDTO[]; total: number }> {
  const { classId, termId, studentId, date, page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  // Build where — must validate class/term belong to school
  const where = {
    ...(classId   ? { classId }   : {}),
    ...(termId    ? { termId }    : {}),
    ...(studentId ? { studentId } : {}),
    ...(date      ? { date: new Date(date) } : {}),
    // Scope to school via class relation
    class: { schoolId },
  };

  const [records, total] = await Promise.all([
    db.attendanceRecord.findMany({
      where,
      skip,
      take:    pageSize,
      orderBy: [{ date: "desc" }, { student: { user: { lastName: "asc" } } }],
      select: {
        id:        true,
        studentId: true,
        classId:   true,
        termId:    true,
        date:      true,
        status:    true,
        note:      true,
        markedBy:  true,
        student: {
          select: {
            indexNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    db.attendanceRecord.count({ where }),
  ]);

  return {
    items: (records as Array<{id: string; studentId: string; classId: string; termId: string; date: Date; status: string; note: string|null; markedBy: string|null; student: {indexNumber: string; user: {firstName: string; lastName: string}}}>) .map((r) => ({
      ...r,
      status: r.status as import("../lib/enums").AttendanceStatus,
      date: r.date.toISOString().split("T")[0]!,
    })),
    total,
  };
}
