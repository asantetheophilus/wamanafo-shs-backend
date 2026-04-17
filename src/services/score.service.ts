// ============================================================
// Wamanafo SHS — Score Service
// State machine: DRAFT → SUBMITTED → APPROVED
//   SUBMITTED → AMENDMENT_REQUESTED → SUBMITTED → APPROVED
// Every transition writes to ScoreAuditLog.
// ============================================================

import { db } from "../lib/db";
import { scoreLogger, reportCardLogger } from "../lib/logger";
import { computeTotalScore, getGrade } from "../lib/grading";
import { ScoreStatus, ReportCardStatus } from "../lib/enums";
import type { UpsertScoreInput, BulkUpsertScoresInput } from "../validators/score";
import type { ScoreDTO, ScoreGridRow, ScoreApprovalRow, ScoreAuditLogDTO } from "../types/score";

// ── Helpers ───────────────────────────────────────────────────

/**
 * Produce a plain-object snapshot suitable for Prisma's Json columns.
 * Converts Prisma Decimal (typed as unknown here) to number | null so
 * TypeScript accepts it as InputJsonValue.
 */
function scoreSnapshot(score: {
  classScore: number | null;
  examScore:  number | null;
  totalScore: unknown;
  grade:      string | null;
  gradePoint: number | null;
  status:     ScoreStatus;
}): {
  classScore: number | null;
  examScore:  number | null;
  totalScore: number | null;   // ← always number|null, never Decimal/unknown
  grade:      string | null;
  gradePoint: number | null;
  status:     string;
} {
  return {
    classScore: score.classScore,
    examScore:  score.examScore,
    totalScore: score.totalScore != null ? Number(score.totalScore) : null,
    grade:      score.grade,
    gradePoint: score.gradePoint,
    status:     score.status,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recomputeScore(
  tx: any,
  scoreId: string,
  classScore: number | null,
  examScore:  number | null,
  classScoreWeight: number,
  examScoreWeight:  number
) {
  const total  = computeTotalScore(classScore, examScore, classScoreWeight, examScoreWeight);
  const graded = total !== null ? getGrade(total) : null;

  await tx.score.update({
    where: { id: scoreId },
    data: {
      totalScore: total !== null ? total : null,
      grade:      graded?.grade      ?? null,
      gradePoint: graded?.gradePoint ?? null,
      remark:     graded?.remark     ?? null,
    },
  });

  return { total, graded };
}

// ── Get score grid for a subject/class/term ───────────────────

export async function getScoreGrid(
  schoolId:  string,
  classId:   string,
  subjectId: string,
  termId:    string
): Promise<ScoreGridRow[]> {
  const cls = await db.class.findFirst({
    where:  { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const term = await db.term.findFirst({
    where:  { id: termId, year: { schoolId } },
    select: { id: true },
  });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });

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

  const scores = await db.score.findMany({
    where: {
      subjectId, termId,
      studentId: { in: (enrollments as EnrollRow[]).map((e) => e.student.id) },
    },
    select: {
      id:         true,
      studentId:  true,
      classScore: true,
      examScore:  true,
      totalScore: true,
      grade:      true,
      gradePoint: true,
      status:     true,
    },
  });

  type ScoreRow = {
    id:         string;
    studentId:  string;
    classScore: number | null;
    examScore:  number | null;
    totalScore: unknown;
    grade:      string | null;
    gradePoint: number | null;
    status:     string;
  };
  const scoreMap = new Map((scores as ScoreRow[]).map((s) => [s.studentId, s]));

  return (enrollments as EnrollRow[])
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => {
      const score = scoreMap.get(e.student.id);
      return {
        scoreId:     score?.id         ?? null,
        studentId:   e.student.id,
        indexNumber: e.student.indexNumber,
        firstName:   e.student.user.firstName,
        lastName:    e.student.user.lastName,
        classScore:  score?.classScore  ?? null,
        examScore:   score?.examScore   ?? null,
        totalScore:  score?.totalScore != null ? Number(score.totalScore) : null,
        grade:       score?.grade       ?? null,
        gradePoint:  score?.gradePoint  ?? null,
        status:      (score?.status ?? null) as import("../lib/enums").ScoreStatus | null,
      };
    });
}

// ── Upsert a single score (DRAFT) ────────────────────────────

export async function upsertScore(
  schoolId: string,
  actorId:  string,
  input:    UpsertScoreInput
): Promise<ScoreDTO> {
  const { studentId, subjectId, termId, classScore, examScore } = input;

  const [student, subject, term] = await Promise.all([
    db.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } }),
    db.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true } }),
    db.term.findFirst({
      where:  { id: termId, year: { schoolId } },
      select: { id: true, classScoreWeight: true, examScoreWeight: true },
    }),
  ]);
  if (!student) throw Object.assign(new Error("Student not found."),  { code: "NOT_FOUND" });
  if (!subject) throw Object.assign(new Error("Subject not found."),  { code: "NOT_FOUND" });
  if (!term)    throw Object.assign(new Error("Term not found."),     { code: "NOT_FOUND" });

  if (!term.classScoreWeight || !term.examScoreWeight) {
    throw Object.assign(
      new Error("Term score weights are not configured. Ask your administrator to set them."),
      { code: "PREREQUISITE_FAILED" }
    );
  }

  const existing = await db.score.findUnique({
    where: { studentId_subjectId_termId: { studentId, subjectId, termId } },
  });
  if (existing?.status === ScoreStatus.APPROVED) {
    throw Object.assign(new Error("This score is approved and cannot be edited."), { code: "SCORE_LOCKED" });
  }
  if (existing?.status === ScoreStatus.SUBMITTED) {
    throw Object.assign(new Error("This score has been submitted for approval and cannot be edited."), { code: "SCORE_LOCKED" });
  }

  const total  = computeTotalScore(classScore ?? null, examScore ?? null, term.classScoreWeight, term.examScoreWeight);
  const graded = total !== null ? getGrade(total) : null;

  const score = await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    const before = existing ? scoreSnapshot(existing) : null;

    const upserted = await tx.score.upsert({
      where:  { studentId_subjectId_termId: { studentId, subjectId, termId } },
      create: {
        studentId, subjectId, termId,
        classScore: classScore ?? null,
        examScore:  examScore  ?? null,
        totalScore: total !== null ? total : null,
        grade:      graded?.grade      ?? null,
        gradePoint: graded?.gradePoint ?? null,
        remark:     graded?.remark     ?? null,
        status:     ScoreStatus.DRAFT,
      },
      update: {
        classScore: classScore ?? null,
        examScore:  examScore  ?? null,
        totalScore: total !== null ? total : null,
        grade:      graded?.grade      ?? null,
        gradePoint: graded?.gradePoint ?? null,
        remark:     graded?.remark     ?? null,
        status:     ScoreStatus.DRAFT,
      },
    });

    await tx.scoreAuditLog.create({
      data: {
        scoreId:     upserted.id,
        changedBy:   actorId,
        action:      existing ? "UPDATED" : "CREATED",
        beforeState: before ?? undefined,
        afterState:  scoreSnapshot(upserted),
      },
    });

    return upserted;
  });

  scoreLogger.created(score.id, { studentId, subjectId, termId, actorId, schoolId });
  return getScoreById(schoolId, score.id) as Promise<ScoreDTO>;
}

// ── Bulk upsert scores (teacher grid save) ───────────────────

export async function bulkUpsertScores(
  schoolId: string,
  actorId:  string,
  input:    BulkUpsertScoresInput
): Promise<{ saved: number }> {
  const { subjectId, termId, scores } = input;

  const term = await db.term.findFirst({
    where:  { id: termId, year: { schoolId } },
    select: { classScoreWeight: true, examScoreWeight: true },
  });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });
  if (!term.classScoreWeight || !term.examScoreWeight) {
    throw Object.assign(new Error("Term score weights are not configured."), { code: "PREREQUISITE_FAILED" });
  }

  let saved = 0;
  for (const entry of scores) {
    const existing = await db.score.findUnique({
      where:  { studentId_subjectId_termId: { studentId: entry.studentId, subjectId, termId } },
      select: { id: true, status: true },
    });
    if (existing?.status === ScoreStatus.APPROVED || existing?.status === ScoreStatus.SUBMITTED) {
      continue;
    }

    const total  = computeTotalScore(entry.classScore ?? null, entry.examScore ?? null, term.classScoreWeight, term.examScoreWeight);
    const graded = total !== null ? getGrade(total) : null;

    const before = existing ? await db.score.findUnique({ where: { id: existing.id } }) : null;

    const upserted = await db.score.upsert({
      where:  { studentId_subjectId_termId: { studentId: entry.studentId, subjectId, termId } },
      create: {
        studentId: entry.studentId, subjectId, termId,
        classScore: entry.classScore ?? null,
        examScore:  entry.examScore  ?? null,
        totalScore: total ?? null,
        grade:      graded?.grade      ?? null,
        gradePoint: graded?.gradePoint ?? null,
        remark:     graded?.remark     ?? null,
        status:     ScoreStatus.DRAFT,
      },
      update: {
        classScore: entry.classScore ?? null,
        examScore:  entry.examScore  ?? null,
        totalScore: total ?? null,
        grade:      graded?.grade      ?? null,
        gradePoint: graded?.gradePoint ?? null,
        remark:     graded?.remark     ?? null,
      },
    });

    await db.scoreAuditLog.create({
      data: {
        scoreId:     upserted.id,
        changedBy:   actorId,
        action:      before ? "UPDATED" : "CREATED",
        beforeState: before ? scoreSnapshot(before) : undefined,
        afterState:  scoreSnapshot(upserted),
      },
    });

    saved++;
  }

  return { saved };
}

// ── Submit scores for approval (teacher) ─────────────────────

export async function submitScores(
  schoolId:  string,
  actorId:   string,
  subjectId: string,
  classId:   string,
  termId:    string
): Promise<{ submitted: number }> {
  const teacher = await db.teacher.findFirst({
    where:  { userId: actorId, schoolId },
    select: { id: true },
  });
  if (!teacher) throw Object.assign(new Error("Teacher record not found."), { code: "NOT_FOUND" });

  const assignment = await db.teachingAssignment.findFirst({
    where: { teacherId: teacher.id, subjectId, classId, termId },
  });
  if (!assignment) throw Object.assign(new Error("You are not assigned to this subject and class."), { code: "FORBIDDEN" });

  const cls = await db.class.findFirst({
    where:  { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const enrollments = await db.classEnrollment.findMany({
    where:  { classId, yearId: cls.yearId },
    select: { studentId: true },
  });
  const studentIds = (enrollments as Array<{ studentId: string }>).map((e) => e.studentId);

  const drafts = await db.score.findMany({
    where: { subjectId, termId, studentId: { in: studentIds }, status: ScoreStatus.DRAFT },
    select: { id: true, classScore: true, examScore: true },
  });

  const incomplete = (drafts as Array<{ classScore: unknown; examScore: unknown }>)
    .filter((d) => d.classScore === null || d.examScore === null);
  if (incomplete.length > 0) {
    throw Object.assign(
      new Error(`${incomplete.length} score(s) are missing class or exam scores. All scores must be complete before submission.`),
      { code: "PREREQUISITE_FAILED" }
    );
  }

  const now = new Date();
  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    for (const draft of drafts) {
      await tx.score.update({
        where: { id: draft.id },
        data:  { status: ScoreStatus.SUBMITTED, submittedAt: now },
      });
      await tx.scoreAuditLog.create({
        data: {
          scoreId:    draft.id,
          changedBy:  actorId,
          action:     "SUBMITTED",
          afterState: { status: ScoreStatus.SUBMITTED },
        },
      });
      scoreLogger.submitted(draft.id, { actorId, schoolId, subjectId, classId, termId });
    }
  });

  return { submitted: drafts.length };
}

// ── Approve a score (admin) ───────────────────────────────────

export async function approveScore(
  schoolId: string,
  actorId:  string,
  scoreId:  string
): Promise<ScoreDTO> {
  const score = await db.score.findFirst({
    where:   { id: scoreId },
    include: { term: true },
  });
  if (!score) throw Object.assign(new Error("Score not found."), { code: "NOT_FOUND" });

  const termYear = await db.term.findFirst({ where: { id: score.termId, year: { schoolId } } });
  if (!termYear) throw Object.assign(new Error("Score not found."), { code: "NOT_FOUND" });

  if (score.status !== ScoreStatus.SUBMITTED) {
    throw Object.assign(new Error("Only submitted scores can be approved."), { code: "SCORE_LOCKED" });
  }

  const before = scoreSnapshot(score);
  const now    = new Date();

  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    await recomputeScore(tx, scoreId, score.classScore, score.examScore, score.term.classScoreWeight, score.term.examScoreWeight);

    await tx.score.update({
      where: { id: scoreId },
      data:  { status: ScoreStatus.APPROVED, approvedAt: now },
    });

    await tx.scoreAuditLog.create({
      data: {
        scoreId,
        changedBy:   actorId,
        action:      "APPROVED",
        beforeState: before,
        afterState:  { status: ScoreStatus.APPROVED, approvedAt: now.toISOString() },
      },
    });

    const published = await tx.reportCard.findUnique({
      where:  { studentId_termId: { studentId: score.studentId, termId: score.termId } },
      select: { id: true, status: true },
    });
    if (published?.status === ReportCardStatus.PUBLISHED) {
      await tx.reportCard.update({
        where: { id: published.id },
        data:  { status: ReportCardStatus.DRAFT, publishedAt: null, publishedBy: null },
      });
      reportCardLogger.invalidated(score.studentId, score.termId, `Score ${scoreId} approved after publication`);
    }
  });

  scoreLogger.approved(scoreId, { actorId, schoolId });
  void import("./sms.service").then(({ notifyScoreApproved }) =>
    notifyScoreApproved(schoolId, scoreId)
  );
  return getScoreById(schoolId, scoreId) as Promise<ScoreDTO>;
}

// ── Request amendment (admin → teacher) ──────────────────────

export async function requestAmendment(
  schoolId: string,
  actorId:  string,
  scoreId:  string,
  reason:   string
): Promise<ScoreDTO> {
  const score = await db.score.findFirst({ where: { id: scoreId } });
  if (!score) throw Object.assign(new Error("Score not found."), { code: "NOT_FOUND" });

  const termYear = await db.term.findFirst({ where: { id: score.termId, year: { schoolId } } });
  if (!termYear) throw Object.assign(new Error("Score not found."), { code: "NOT_FOUND" });

  if (score.status !== ScoreStatus.SUBMITTED) {
    throw Object.assign(new Error("Only submitted scores can have an amendment requested."), { code: "SCORE_LOCKED" });
  }

  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    await tx.score.update({
      where: { id: scoreId },
      data:  { status: ScoreStatus.AMENDMENT_REQUESTED, amendmentReason: reason },
    });
    await tx.scoreAuditLog.create({
      data: {
        scoreId,
        changedBy:   actorId,
        action:      "AMENDMENT_REQUESTED",
        beforeState: scoreSnapshot(score),
        afterState:  { status: ScoreStatus.AMENDMENT_REQUESTED },
        reason,
      },
    });
  });

  scoreLogger.amendmentRequested(scoreId, { actorId, schoolId, reason });
  void import("./sms.service").then(({ notifyAmendmentRequested }) =>
    notifyAmendmentRequested(schoolId, scoreId)
  );
  return getScoreById(schoolId, scoreId) as Promise<ScoreDTO>;
}

// ── Resubmit after amendment (teacher) ───────────────────────

export async function resubmitScore(
  schoolId: string,
  actorId:  string,
  scoreId:  string
): Promise<ScoreDTO> {
  const score = await db.score.findFirst({
    where:   { id: scoreId },
    include: { term: true },
  });
  if (!score) throw Object.assign(new Error("Score not found."), { code: "NOT_FOUND" });

  const termYear = await db.term.findFirst({ where: { id: score.termId, year: { schoolId } } });
  if (!termYear) throw Object.assign(new Error("Score not found."), { code: "NOT_FOUND" });

  if (score.status !== ScoreStatus.AMENDMENT_REQUESTED) {
    throw Object.assign(new Error("Only amendment-requested scores can be resubmitted."), { code: "SCORE_LOCKED" });
  }

  const before = scoreSnapshot(score);
  const now    = new Date();

  await db.$transaction(async (tx: import("../lib/prisma-types").PrismaTx) => {
    await recomputeScore(tx, scoreId, score.classScore, score.examScore, score.term.classScoreWeight, score.term.examScoreWeight);

    await tx.score.update({
      where: { id: scoreId },
      data:  { status: ScoreStatus.SUBMITTED, submittedAt: now, amendmentReason: null },
    });
    await tx.scoreAuditLog.create({
      data: {
        scoreId,
        changedBy:   actorId,
        action:      "RESUBMITTED",
        beforeState: before,
        afterState:  { status: ScoreStatus.SUBMITTED },
      },
    });
  });

  return getScoreById(schoolId, scoreId) as Promise<ScoreDTO>;
}

// ── Get scores pending approval (admin) ──────────────────────

export async function getScoresPendingApproval(
  schoolId: string,
  classId?: string,
  termId?:  string
): Promise<ScoreApprovalRow[]> {
  const scores = await db.score.findMany({
    where: {
      status: { in: [ScoreStatus.SUBMITTED, ScoreStatus.AMENDMENT_REQUESTED] },
      term:   { year: { schoolId } },
      ...(termId ? { termId } : {}),
    },
    orderBy: { submittedAt: "asc" },
    include: {
      student: {
        select: {
          indexNumber: true,
          user: { select: { firstName: true, lastName: true } },
          enrollments: {
            where: classId ? { classId } : {},
            take:  1,
            select: { class: { select: { name: true } } },
          },
        },
      },
      subject: { select: { name: true } },
    },
  });

  type PendingScore = {
    id:              string;
    classScore:      number | null;
    examScore:       number | null;
    totalScore:      unknown;
    grade:           string | null;
    status:          string;
    submittedAt:     Date | null;
    amendmentReason: string | null;
    student: {
      indexNumber: string;
      user:        { firstName: string; lastName: string };
      enrollments: Array<{ class: { name: string } }>;
    };
    subject: { name: string };
  };

  const filtered = classId
    ? (scores as PendingScore[]).filter((s) => s.student.enrollments.length > 0)
    : (scores as PendingScore[]);

  return filtered.map((s) => ({
    scoreId:         s.id,
    studentName:     `${s.student.user.lastName}, ${s.student.user.firstName}`,
    indexNumber:     s.student.indexNumber,
    subjectName:     s.subject.name,
    className:       s.student.enrollments[0]?.class.name ?? "—",
    classScore:      s.classScore,
    examScore:       s.examScore,
    totalScore:      s.totalScore != null ? Number(s.totalScore) : null,
    grade:           s.grade,
    status:          s.status as import("../lib/enums").ScoreStatus,
    submittedAt:     s.submittedAt?.toISOString() ?? null,
    amendmentReason: s.amendmentReason,
  }));
}

// ── Get audit log for a score ─────────────────────────────────

export async function getScoreAuditLog(
  schoolId: string,
  scoreId:  string
): Promise<ScoreAuditLogDTO[]> {
  const score = await db.score.findFirst({
    where: { id: scoreId, term: { year: { schoolId } } },
  });
  if (!score) throw Object.assign(new Error("Score not found."), { code: "NOT_FOUND" });

  const logs = await db.scoreAuditLog.findMany({
    where:   { scoreId },
    orderBy: { createdAt: "asc" },
  });

  type AuditRow = {
    id:          string;
    scoreId:     string;
    action:      string;
    changedBy:   string;
    createdAt:   Date;
    reason:      string | null;
    beforeState: unknown;
    afterState:  unknown;
  };

  return (logs as AuditRow[]).map((l) => ({
    id:          l.id,
    scoreId:     l.scoreId,
    changedBy:   l.changedBy,
    action:      l.action,
    beforeState: l.beforeState as Record<string, unknown> | null,
    afterState:  l.afterState  as Record<string, unknown> | null,
    reason:      l.reason,
    createdAt:   l.createdAt.toISOString(),
  }));
}

// ── Get single score by ID ────────────────────────────────────

export async function getScoreById(
  schoolId: string,
  scoreId:  string
): Promise<ScoreDTO | null> {
  const s = await db.score.findFirst({
    where: { id: scoreId, term: { year: { schoolId } } },
    include: {
      student: {
        select: {
          id: true, indexNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      subject: { select: { id: true, name: true, code: true, isCore: true } },
      term:    { select: { id: true, name: true, classScoreWeight: true, examScoreWeight: true } },
    },
  });
  if (!s) return null;

  return {
    id:              s.id,
    studentId:       s.studentId,
    subjectId:       s.subjectId,
    termId:          s.termId,
    classScore:      s.classScore,
    examScore:       s.examScore,
    totalScore:      s.totalScore != null ? Number(s.totalScore) : null,
    grade:           s.grade,
    gradePoint:      s.gradePoint,
    remark:          s.remark,
    status:          s.status,
    submittedAt:     s.submittedAt?.toISOString() ?? null,
    approvedAt:      s.approvedAt?.toISOString()  ?? null,
    amendmentReason: s.amendmentReason,
    student:         s.student,
    subject:         s.subject,
    term:            s.term,
  };
}
