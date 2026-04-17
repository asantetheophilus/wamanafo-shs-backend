// ============================================================
// Wamanafo SHS — Grading Service
// Computes and persists grades, DENSE rankings, and aggregates
// for a full class in a term.
//
// KEY RULES (GES policy — do not relax):
//  - Only APPROVED scores contribute to rankings/aggregates.
//  - null totalScore ≠ 0 — excluded from all calculations.
//  - DENSE ranking: ties share rank, no rank skipped after tie.
//  - Subject ranking excludes students with null totalScore.
//  - Overall ranking: sort by overallTotal desc, then
//    overallAverage desc as tie-breaker.
//  - Aggregate: best 3 core GPs + best 3 elective GPs.
//    If fewer than 3 valid of either → aggregate is null.
//  - Withdrawn students excluded from rankings.
// ============================================================

import { db } from "../lib/db";
import { computeAggregate } from "../lib/grading";
import { rankBySubjectScore, rankByOverall } from "../lib/ranking";
import { computeAttendanceSummary } from "../lib/attendance";
import { AttendanceStatus, ScoreStatus } from "../lib/enums";
import type {
  StudentTermResult,
  ClassResultRow,
  SubjectRankingRow,
} from "../types/report";

// ── Internal types ────────────────────────────────────────────

/** Shape returned by the approvedScores query */
type ApprovedScore = {
  id:         string;
  studentId:  string;
  subjectId:  string;
  classScore: number | null;
  examScore:  number | null;
  totalScore: unknown;           // Prisma Decimal — convert with Number() before use
  grade:      string | null;
  gradePoint: number | null;
  remark:     string | null;
  subject: {
    id:     string;
    name:   string;
    code:   string;
    isCore: boolean;
  };
};

type StudentRow = {
  id:          string;
  indexNumber: string;
  status:      string;
  user: { firstName: string; lastName: string };
};

// ── Helpers ───────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Main computation ──────────────────────────────────────────

/**
 * Compute grades, rankings, and aggregates for every active
 * student in a class for a given term.
 */
export async function computeClassResults(
  schoolId:          string,
  classId:           string,
  termId:            string,
  includeAttendance = false
): Promise<StudentTermResult[]> {

  // 1. Validate class and term
  const cls = await db.class.findFirst({
    where:  { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const term = await db.term.findFirst({
    where:  { id: termId, year: { schoolId } },
    select: { id: true, totalSchoolDays: true },
  });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });

  // 2. Load enrolled active students
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

  const activeStudents = (enrollments as Array<{ student: StudentRow }>)
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => e.student);

  if (activeStudents.length === 0) return [];

  const studentIds = activeStudents.map((s) => s.id);

  // 3. Load all APPROVED scores — one query, no N+1
  const approvedScores = (await db.score.findMany({
    where: {
      termId,
      studentId: { in: studentIds },
      status:    ScoreStatus.APPROVED,
    },
    select: {
      id:         true,
      studentId:  true,
      subjectId:  true,
      classScore: true,
      examScore:  true,
      totalScore: true,
      grade:      true,
      gradePoint: true,
      remark:     true,
      subject: {
        select: { id: true, name: true, code: true, isCore: true },
      },
    },
  })) as ApprovedScore[];

  // 4. Collect unique subjects
  const subjectMap = new Map<string, ApprovedScore["subject"]>();
  for (const s of approvedScores) {
    subjectMap.set(s.subjectId, s.subject);
  }

  // 5. Group by subject for per-subject ranking
  const scoresBySubject = new Map<string, Array<{ studentId: string; totalScore: number | null }>>();
  for (const score of approvedScores) {
    const list = scoresBySubject.get(score.subjectId) ?? [];
    list.push({
      studentId:  score.studentId,
      totalScore: score.totalScore != null ? Number(score.totalScore) : null,
    });
    scoresBySubject.set(score.subjectId, list);
  }

  // Compute DENSE ranking per subject
  const subjectRankings = new Map<string, Map<string, number | null>>();
  for (const [subjectId, rows] of scoresBySubject.entries()) {
    const allRows = studentIds.map((sid) => ({
      studentId:  sid,
      totalScore: rows.find((r) => r.studentId === sid)?.totalScore ?? null,
    }));
    const ranked = rankBySubjectScore(allRows);
    subjectRankings.set(subjectId, new Map(ranked.map((r) => [r.studentId, r.position])));
  }

  // 6. Group scores by student
  const scoresByStudent = new Map<string, ApprovedScore[]>();
  for (const score of approvedScores) {
    const list = scoresByStudent.get(score.studentId) ?? [];
    list.push(score);
    scoresByStudent.set(score.studentId, list);
  }

  // 7. Compute per-student totals
  const overallRows = activeStudents.map((student) => {
    const scores  = scoresByStudent.get(student.id) ?? [];
    const totals  = scores
      .map((s) => (s.totalScore != null ? Number(s.totalScore) : null))
      .filter((t): t is number => t !== null);

    const overallTotal   = totals.length > 0 ? round2(totals.reduce((a, b) => a + b, 0)) : null;
    const overallAverage = totals.length > 0 ? round2(overallTotal! / totals.length) : null;

    return { studentId: student.id, overallTotal, overallAverage };
  });

  // 8. DENSE overall ranking
  const overallRanked = rankByOverall(overallRows);
  const positionMap   = new Map(overallRanked.map((r) => [r.studentId, r.position]));

  // 9. Compute aggregates
  const aggregateMap = new Map<string, number | null>();
  for (const student of activeStudents) {
    const scores = scoresByStudent.get(student.id) ?? [];
    const subjectInputs = scores
      .filter((s) => s.totalScore != null)
      .map((s) => ({
        subjectId:  s.subjectId,
        isCore:     s.subject.isCore,
        totalScore: Number(s.totalScore),
      }));
    const { aggregate } = computeAggregate(subjectInputs);
    aggregateMap.set(student.id, aggregate);
  }

  // 10. Attendance (optional)
  const attendanceMap = new Map<string, { percentage: number | null; daysAbsent: number }>();
  if (includeAttendance) {
    const allAttendance = await db.attendanceRecord.findMany({
      where:  { classId, termId, studentId: { in: studentIds } },
      select: { studentId: true, status: true },
    });
    const byStudent = new Map<string, Array<{ status: AttendanceStatus }>>();
    for (const rec of allAttendance) {
      const list = byStudent.get(rec.studentId) ?? [];
      list.push({ status: rec.status as AttendanceStatus });
      byStudent.set(rec.studentId, list);
    }
    for (const student of activeStudents) {
      const records = byStudent.get(student.id) ?? [];
      const summary = computeAttendanceSummary(records, term.totalSchoolDays);
      attendanceMap.set(student.id, {
        percentage: summary.attendancePercentage,
        daysAbsent: summary.daysAbsent,
      });
    }
  }

  // 11. Persist classPosition + aggregate to ReportCard
  await Promise.all(
    activeStudents.map(async (student) => {
      const overall    = overallRows.find((r) => r.studentId === student.id);
      const position   = positionMap.get(student.id) ?? null;
      const aggregate  = aggregateMap.get(student.id) ?? null;
      const attendance = attendanceMap.get(student.id);

      await db.reportCard.upsert({
        where:  { studentId_termId: { studentId: student.id, termId } },
        create: {
          studentId:            student.id,
          termId,
          overallTotal:         overall?.overallTotal   ?? null,
          overallAverage:       overall?.overallAverage ?? null,
          classPosition:        position,
          aggregate,
          attendancePercentage: attendance?.percentage ?? null,
          daysAbsent:           attendance?.daysAbsent ?? 0,
        },
        update: {
          overallTotal:         overall?.overallTotal   ?? null,
          overallAverage:       overall?.overallAverage ?? null,
          classPosition:        position,
          aggregate,
          ...(includeAttendance ? {
            attendancePercentage: attendance?.percentage ?? null,
            daysAbsent:           attendance?.daysAbsent ?? 0,
          } : {}),
        },
      });
    })
  );

  // 12. Assemble final result set
  return activeStudents.map((student) => {
    const scores     = scoresByStudent.get(student.id) ?? [];
    const overall    = overallRows.find((r) => r.studentId === student.id)!;
    const position   = positionMap.get(student.id) ?? null;
    const aggregate  = aggregateMap.get(student.id) ?? null;
    const attendance = attendanceMap.get(student.id) ?? { percentage: null, daysAbsent: 0 };

    const subjects: StudentTermResult["subjects"] = Array.from(subjectMap.values()).map((subj) => {
      const score   = scores.find((s) => s.subjectId === subj.id);
      const rankMap = subjectRankings.get(subj.id);
      return {
        subjectId:   subj.id,
        subjectName: subj.name,
        subjectCode: subj.code,
        isCore:      subj.isCore,
        classScore:  score?.classScore  ?? null,
        examScore:   score?.examScore   ?? null,
        totalScore:  score?.totalScore != null ? Number(score.totalScore) : null,
        grade:       score?.grade       ?? null,
        gradePoint:  score?.gradePoint  ?? null,
        remark:      score?.remark      ?? null,
        subjectRank: rankMap?.get(student.id) ?? null,
      };
    });

    return {
      studentId:            student.id,
      indexNumber:          student.indexNumber,
      firstName:            student.user.firstName,
      lastName:             student.user.lastName,
      subjects,
      overallTotal:         overall.overallTotal,
      overallAverage:       overall.overallAverage,
      classPosition:        position,
      aggregate,
      attendancePercentage: attendance.percentage,
      daysAbsent:           attendance.daysAbsent,
    };
  });
}

// ── Subject-level ranking for a class ────────────────────────

export async function getSubjectRanking(
  schoolId:  string,
  classId:   string,
  subjectId: string,
  termId:    string
): Promise<SubjectRankingRow[]> {
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

  const activeStudentIds = (enrollments as Array<{ student: StudentRow }>)
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => e.student.id);

  type SMap = {
    studentId:  string;
    classScore: number | null;
    examScore:  number | null;
    totalScore: unknown;
    grade:      string | null;
    gradePoint: number | null;
    remark:     string | null;
  };

  const scores = (await db.score.findMany({
    where: {
      subjectId, termId,
      studentId: { in: activeStudentIds },
      status:    ScoreStatus.APPROVED,
    },
    select: {
      studentId:  true,
      classScore: true,
      examScore:  true,
      totalScore: true,
      grade:      true,
      gradePoint: true,
      remark:     true,
    },
  })) as SMap[];

  const scoreMap = new Map(scores.map((s) => [s.studentId, s]));

  const rankInput = activeStudentIds.map((sid) => {
    const s = scoreMap.get(sid);
    return {
      studentId:  sid,
      totalScore: s?.totalScore != null ? Number(s.totalScore) : null,
    };
  });

  const ranked = rankBySubjectScore(rankInput);
  const posMap = new Map(ranked.map((r) => [r.studentId, r.position]));

  return (enrollments as Array<{ student: StudentRow }>)
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => {
      const s = scoreMap.get(e.student.id);
      return {
        studentId:   e.student.id,
        indexNumber: e.student.indexNumber,
        firstName:   e.student.user.firstName,
        lastName:    e.student.user.lastName,
        classScore:  s?.classScore  ?? null,
        examScore:   s?.examScore   ?? null,
        totalScore:  s?.totalScore != null ? Number(s.totalScore) : null,
        grade:       s?.grade       ?? null,
        gradePoint:  s?.gradePoint  ?? null,
        remark:      s?.remark      ?? null,
        position:    posMap.get(e.student.id) ?? null,
      };
    })
    .sort((a, b) => {
      if (a.position === null && b.position === null) return 0;
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    });
}

// ── Class results summary (lighter — no subject detail) ───────

export async function getClassResultsSummary(
  schoolId: string,
  classId:  string,
  termId:   string
): Promise<ClassResultRow[]> {
  const results = await computeClassResults(schoolId, classId, termId, false);

  return results
    .map((r) => ({
      studentId:      r.studentId,
      indexNumber:    r.indexNumber,
      firstName:      r.firstName,
      lastName:       r.lastName,
      overallTotal:   r.overallTotal,
      overallAverage: r.overallAverage,
      classPosition:  r.classPosition,
      aggregate:      r.aggregate,
      subjectCount:   r.subjects.length,
      gradedCount:    r.subjects.filter((s) => s.totalScore !== null).length,
    }))
    .sort((a, b) => {
      if (a.classPosition === null && b.classPosition === null) return 0;
      if (a.classPosition === null) return 1;
      if (b.classPosition === null) return -1;
      return a.classPosition - b.classPosition;
    });
}
