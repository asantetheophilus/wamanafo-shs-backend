/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// Wamanafo SHS — Analytics Service
// Powers the admin dashboard with real-time school statistics.
// All queries scoped to schoolId.
// ============================================================

import { db } from "../lib/db";
import { ScoreStatus, ReportCardStatus, StudentStatus } from "../lib/enums";

export interface DashboardStats {
  // Counts
  totalStudents:   number;
  activeStudents:  number;
  totalTeachers:   number;
  totalClasses:    number;

  // Pending actions
  pendingScores:        number;   // SUBMITTED or AMENDMENT_REQUESTED
  unpublishedReportCards: number; // DRAFT cards that have been generated

  // Attendance (current term)
  averageAttendancePercent: number | null;
  belowThresholdCount:      number;

  // Score distribution (current term, approved only)
  gradeDistribution: Array<{ grade: string; count: number }>;

  // Class performance (average total score per class, current term)
  classPerformance: Array<{ className: string; averageScore: number | null }>;

  // Term info
  currentTermName: string | null;
  currentYearName: string | null;
}

export async function getDashboardStats(schoolId: string): Promise<DashboardStats> {
  // ── Current term / year ───────────────────────────────────
  const currentTerm = await db.term.findFirst({
    where:   { isCurrent: true, year: { schoolId } },
    select:  { id: true, name: true, year: { select: { name: true } } },
  });

  // ── Student counts ────────────────────────────────────────
  const [totalStudents, activeStudents] = await Promise.all([
    db.student.count({ where: { schoolId } }),
    db.student.count({ where: { schoolId, status: StudentStatus.ACTIVE } }),
  ]);

  // ── Teacher count ─────────────────────────────────────────
  const totalTeachers = await db.teacher.count({ where: { schoolId } });

  // ── Class count (current year) ────────────────────────────
  const currentYear = await db.academicYear.findFirst({
    where: { schoolId, isCurrent: true },
    select: { id: true },
  });
  const totalClasses = currentYear
    ? await db.class.count({ where: { schoolId, yearId: currentYear.id } })
    : 0;

  // ── Pending approvals ─────────────────────────────────────
  const pendingScores = currentTerm
    ? await db.score.count({
        where: {
          status: { in: [ScoreStatus.SUBMITTED, ScoreStatus.AMENDMENT_REQUESTED] },
          term:   { year: { schoolId } },
          termId: currentTerm.id,
        },
      })
    : 0;

  // ── Unpublished generated report cards ───────────────────
  const unpublishedReportCards = currentTerm
    ? await db.reportCard.count({
        where: {
          status: ReportCardStatus.DRAFT,
          termId: currentTerm.id,
          generatedAt: { not: null },
          term: { year: { schoolId } },
        },
      })
    : 0;

  // ── Attendance stats (current term) ──────────────────────
  let averageAttendancePercent: number | null = null;
  let belowThresholdCount = 0;

  if (currentTerm) {
    const reportCards = await db.reportCard.findMany({
      where: {
        termId: currentTerm.id,
        term:   { year: { schoolId } },
        attendancePercentage: { not: null },
      },
      select: { attendancePercentage: true },
    });

    if (reportCards.length > 0) {
      const sum = reportCards.reduce(
        (acc: number, r: {attendancePercentage: unknown}) => acc + Number(r.attendancePercentage!),
        0
      );
      averageAttendancePercent = Math.round((sum / reportCards.length) * 10) / 10;
      belowThresholdCount = (reportCards as Array<{attendancePercentage: unknown}>).filter(
        (r) => Number(r.attendancePercentage!) < 75
      ).length;
    }
  }

  // ── Grade distribution (current term, approved scores) ───
  let gradeDistribution: Array<{ grade: string; count: number }> = [];
  if (currentTerm) {
    const scores = await db.score.groupBy({
      by: ["grade"],
      where: {
        termId: currentTerm.id,
        status: ScoreStatus.APPROVED,
        grade:  { not: null },
        term:   { year: { schoolId } },
      },
      _count: { id: true },
      orderBy: { grade: "asc" },
    });

    const GRADE_ORDER = ["A1","B2","B3","C4","C5","C6","D7","E8","F9"];
    gradeDistribution = GRADE_ORDER.map((g) => ({
      grade: g,
      count: (scores as Array<{ grade: string | null; _count: { id: number } }>).find((s) => s.grade === g)?._count.id ?? 0,
    }));
  }

  // ── Class performance (current term) ─────────────────────
  let classPerformance: Array<{ className: string; averageScore: number | null }> = [];
  if (currentTerm && currentYear) {
    const classes = await db.class.findMany({
      where:   { schoolId, yearId: currentYear.id },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
      take:    10,
    });

    classPerformance = await Promise.all(
      (classes as Array<{ id: string; name: string }>).map(async (cls) => {
        const enrollments = await db.classEnrollment.findMany({
          where:  { classId: cls.id, yearId: currentYear.id },
          select: { studentId: true },
        });
        const studentIds = (enrollments as Array<{ studentId: string }>).map((e) => e.studentId);

        if (studentIds.length === 0) {
          return { className: cls.name, averageScore: null };
        }

        const scores = await db.score.findMany({
          where: {
            termId:    currentTerm.id,
            studentId: { in: studentIds },
            status:    ScoreStatus.APPROVED,
            totalScore: { not: null },
          },
          select: { totalScore: true },
        });

        if (scores.length === 0) {
          return { className: cls.name, averageScore: null };
        }

        const avg =
          (scores as Array<{ totalScore: unknown }>).reduce((sum: number, s) => sum + Number(s.totalScore!), 0) / scores.length;
        return { className: cls.name, averageScore: Math.round(avg * 10) / 10 };
      })
    );
  }

  return {
    totalStudents,
    activeStudents,
    totalTeachers,
    totalClasses,
    pendingScores,
    unpublishedReportCards,
    averageAttendancePercent,
    belowThresholdCount,
    gradeDistribution,
    classPerformance,
    currentTermName: currentTerm?.name ?? null,
    currentYearName: currentTerm?.year.name ?? null,
  };
}
