// ============================================================
// Wamanafo SHS — Promotion Recommendation Service
// Section 3.9: Computed for Term 3 ONLY.
// System produces a RECOMMENDATION — ADMIN always decides.
// System NEVER auto-promotes any student.
//
// Default configurable criteria:
//  - Minimum core subject passes (grade point ≤ 6)
//  - Minimum elective passes
//  - Minimum attendance percentage
//  - Minimum overall average
// ============================================================

import { db } from "../lib/db";
import { ScoreStatus, AttendanceStatus } from "../lib/enums";
import { getGrade, isPassingGrade } from "../lib/grading";
import { computeAttendanceSummary } from "../lib/attendance";
import { PROMOTION_TERM_NUMBER } from "../lib/constants";

export interface PromotionCriteria {
  minCoreSubjectPasses: number;
  minElectivePasses:    number;
  minAttendancePercent: number;
  minOverallAverage:    number;
}

export const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
  minCoreSubjectPasses: 3,
  minElectivePasses:    2,
  minAttendancePercent: 50,
  minOverallAverage:    40,
};

export type PromotionRecommendation = "PROMOTE" | "REPEAT" | "BORDERLINE";

export interface StudentPromotionResult {
  studentId:        string;
  indexNumber:      string;
  firstName:        string;
  lastName:         string;
  recommendation:   PromotionRecommendation;
  details:          string[];
  corePassCount:    number;
  electivePassCount: number;
  attendancePercent: number | null;
  overallAverage:   number | null;
}

// Internal types matching exact Prisma select shapes ─────────

type ScoreRow = {
  studentId:  string;
  totalScore: number | null;   // converted from Decimal at query time
  subject:    { isCore: boolean };
};

type AttendRow = {
  studentId: string;
  status:    AttendanceStatus;
};

// ─────────────────────────────────────────────────────────────

export async function computePromotionRecommendations(
  schoolId:  string,
  classId:   string,
  termId:    string,
  criteria:  PromotionCriteria = DEFAULT_PROMOTION_CRITERIA
): Promise<StudentPromotionResult[]> {
  // Verify this is Term 3
  const term = await db.term.findFirst({
    where:  { id: termId, year: { schoolId } },
    select: { id: true, number: true, totalSchoolDays: true },
  });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });

  if (term.number !== PROMOTION_TERM_NUMBER) {
    throw Object.assign(
      new Error(`Promotion recommendations are only computed for Term ${PROMOTION_TERM_NUMBER}.`),
      { code: "VALIDATION_ERROR" }
    );
  }

  const cls = await db.class.findFirst({
    where:  { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const enrollments = await db.classEnrollment.findMany({
    where:   { classId, yearId: cls.yearId },
    orderBy: { student: { user: { lastName: "asc" } } },
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
  });

  type EnrollRow = { student: { id: string; indexNumber: string; status: string; user: { firstName: string; lastName: string } } };

  const activeStudents = (enrollments as EnrollRow[])
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => e.student);

  if (activeStudents.length === 0) return [];

  const studentIds = activeStudents.map((s) => s.id);

  // Fetch APPROVED scores — convert Decimal totalScore to number at the
  // boundary so the rest of the function works with plain number | null.
  const rawScores = await db.score.findMany({
    where: {
      termId,
      studentId: { in: studentIds },
      status:    ScoreStatus.APPROVED,
    },
    select: {
      studentId:  true,
      totalScore: true,                  // Decimal? in schema
      subject: { select: { isCore: true } },
    },
  });

  // Convert to our internal type — Decimal → number | null here, once.
  type RawScore = (typeof rawScores)[number];
  const scores: ScoreRow[] = rawScores.map((s: RawScore) => ({
    studentId:  s.studentId,
    totalScore: s.totalScore != null ? Number(s.totalScore) : null,
    subject:    s.subject,
  }));

  // Fetch attendance records — status comes back as the Prisma enum string;
  // cast to our AttendanceStatus type which is the same string union.
  const rawAttendance = await db.attendanceRecord.findMany({
    where:  { termId, studentId: { in: studentIds }, classId },
    select: { studentId: true, status: true },
  });

  type RawAttend = (typeof rawAttendance)[number];
  const attendance: AttendRow[] = rawAttendance.map((a: RawAttend) => ({
    studentId: a.studentId,
    status:    a.status as AttendanceStatus,
  }));

  // Group by student
  const scoresByStudent   = new Map<string, ScoreRow[]>();
  const attendByStudent   = new Map<string, AttendRow[]>();

  for (const s of scores) {
    const list = scoresByStudent.get(s.studentId) ?? [];
    list.push(s);
    scoresByStudent.set(s.studentId, list);
  }
  for (const a of attendance) {
    const list = attendByStudent.get(a.studentId) ?? [];
    list.push(a);
    attendByStudent.set(a.studentId, list);
  }

  return activeStudents.map((student) => {
    const studentScores = scoresByStudent.get(student.id) ?? [];
    const studentAttend = attendByStudent.get(student.id) ?? [];
    const reasons: string[] = [];

    // Core passes
    const corePassCount = studentScores
      .filter((s) => s.subject.isCore && s.totalScore !== null)
      .filter((s) => {
        const g = getGrade(s.totalScore!);
        return g ? isPassingGrade(g.gradePoint) : false;
      }).length;

    // Elective passes
    const electivePassCount = studentScores
      .filter((s) => !s.subject.isCore && s.totalScore !== null)
      .filter((s) => {
        const g = getGrade(s.totalScore!);
        return g ? isPassingGrade(g.gradePoint) : false;
      }).length;

    // Attendance
    const attendSummary = computeAttendanceSummary(studentAttend, term.totalSchoolDays);
    const attendPct     = attendSummary.attendancePercentage;

    // Overall average
    const validTotals = studentScores
      .filter((s) => s.totalScore !== null)
      .map((s) => s.totalScore!);
    const overallAverage = validTotals.length > 0
      ? validTotals.reduce((a, b) => a + b, 0) / validTotals.length
      : null;

    // Check criteria
    let fails = 0;

    if (corePassCount < criteria.minCoreSubjectPasses) {
      reasons.push(`Only ${corePassCount} of ${criteria.minCoreSubjectPasses} required core passes.`);
      fails++;
    }
    if (electivePassCount < criteria.minElectivePasses) {
      reasons.push(`Only ${electivePassCount} of ${criteria.minElectivePasses} required elective passes.`);
      fails++;
    }
    if (attendPct !== null && attendPct < criteria.minAttendancePercent) {
      reasons.push(`Attendance ${attendPct.toFixed(1)}% below required ${criteria.minAttendancePercent}%.`);
      fails++;
    }
    if (overallAverage !== null && overallAverage < criteria.minOverallAverage) {
      reasons.push(`Overall average ${overallAverage.toFixed(1)} below required ${criteria.minOverallAverage}.`);
      fails++;
    }

    const recommendation: PromotionRecommendation =
      fails === 0 ? "PROMOTE" : fails === 1 ? "BORDERLINE" : "REPEAT";

    return {
      studentId:         student.id,
      indexNumber:       student.indexNumber,
      firstName:         student.user.firstName,
      lastName:          student.user.lastName,
      recommendation,
      details:           reasons,
      corePassCount,
      electivePassCount,
      attendancePercent: attendPct,
      overallAverage,
    };
  });
}
