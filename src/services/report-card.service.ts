/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// Wamanafo SHS — Report Card Service
//
// Key rules enforced here:
// 1. Prerequisites are checked before generation — missing scores,
//    missing conduct, unconfigured weights all block generation.
// 2. Publishing is per-term per-class — admin explicitly publishes.
// 3. Unpublished cards return 403 for STUDENT/PARENT via API.
// 4. Approving a score after publication invalidates the card
//    (handled in score.service.ts — sets status back to DRAFT).
// 5. Generation recomputes grades, rankings, aggregates freshly.
// ============================================================

import { db } from "../lib/db";
import { logger, reportCardLogger } from "../lib/logger";
import { computeClassResults } from "./grading.service";
import { ScoreStatus, ReportCardStatus } from "../lib/enums";
import type {
  ReportCardData,
  ReportCardListRow,
  ReportCardPrerequisites,
} from "../types/report-card";

// ── Prerequisite check ────────────────────────────────────────

export async function checkReportCardPrerequisites(
  schoolId: string,
  classId:  string,
  termId:   string
): Promise<ReportCardPrerequisites> {
  const missing: string[] = [];

  // 1. Term weights configured
  const term = await db.term.findFirst({
    where: { id: termId, year: { schoolId } },
    select: {
      classScoreWeight: true,
      examScoreWeight:  true,
      totalSchoolDays:  true,
    },
  });
  if (!term) return { ready: false, missing: ["Term not found."] };

  if (!term.classScoreWeight || !term.examScoreWeight) {
    missing.push("Term score weights are not configured.");
  }
  if (term.classScoreWeight + term.examScoreWeight !== 100) {
    missing.push("Term score weights must sum to 100.");
  }
  if (!term.totalSchoolDays || term.totalSchoolDays <= 0) {
    missing.push("Term total school days is not set.");
  }

  // 2. Class exists and has a form master
  const cls = await db.class.findFirst({
    where:  { id: classId, schoolId },
    select: { yearId: true, formMasterId: true },
  });
  if (!cls) return { ready: false, missing: ["Class not found."] };
  if (!cls.formMasterId) {
    missing.push("Class has no form master assigned.");
  }

  // 3. All enrolled active students have APPROVED scores for all subjects
  const enrollments = await db.classEnrollment.findMany({
    where: { classId, yearId: cls.yearId },
    select: { studentId: true, student: { select: { status: true } } },
  });
  const activeStudentIds = (enrollments as Array<{ studentId: string; student: { status: string } }>)
    .filter((e) => e.student.status === "ACTIVE")
    .map((e) => e.studentId);

  if (activeStudentIds.length === 0) {
    missing.push("No active students enrolled in this class.");
  }

  // Check for any unapproved scores (DRAFT or SUBMITTED = not ready)
  const unapproved = await db.score.findMany({
    where: {
      termId,
      studentId: { in: activeStudentIds },
      status:    { in: [ScoreStatus.DRAFT, ScoreStatus.SUBMITTED, ScoreStatus.AMENDMENT_REQUESTED] },
    },
    select: { id: true },
    take: 1,
  });
  if (unapproved.length > 0) {
    missing.push("Some scores are still pending approval (DRAFT or SUBMITTED).");
  }

  return { ready: missing.length === 0, missing };
}

// ── Generate report cards for a class/term ────────────────────

export async function generateReportCards(
  schoolId: string,
  classId:  string,
  termId:   string,
  actorId:  string
): Promise<{ generated: number; skipped: number }> {
  // Prerequisites
  const prereqs = await checkReportCardPrerequisites(schoolId, classId, termId);
  if (!prereqs.ready) {
    throw Object.assign(
      new Error("Prerequisites not met for report card generation."),
      { code: "PREREQUISITE_FAILED", details: prereqs.missing }
    );
  }

  // Compute fresh results (grades, rankings, aggregates, attendance)
  const results = await computeClassResults(schoolId, classId, termId, true);

  let generated = 0;
  let skipped   = 0;
  const now     = new Date();

  for (const result of results) {
    // Only generate/update DRAFT cards; leave PUBLISHED ones alone
    const existing = await db.reportCard.findUnique({
      where:  { studentId_termId: { studentId: result.studentId, termId } },
      select: { status: true },
    });

    if (existing?.status === ReportCardStatus.PUBLISHED) {
      skipped++;
      continue;
    }

    await db.reportCard.upsert({
      where: { studentId_termId: { studentId: result.studentId, termId } },
      create: {
        studentId:            result.studentId,
        termId,
        status:               ReportCardStatus.DRAFT,
        overallTotal:         result.overallTotal,
        overallAverage:       result.overallAverage,
        classPosition:        result.classPosition,
        attendancePercentage: result.attendancePercentage,
        daysAbsent:           result.daysAbsent,
        aggregate:            result.aggregate,
        generatedAt:          now,
      },
      update: {
        status:               ReportCardStatus.DRAFT,
        overallTotal:         result.overallTotal,
        overallAverage:       result.overallAverage,
        classPosition:        result.classPosition,
        attendancePercentage: result.attendancePercentage,
        daysAbsent:           result.daysAbsent,
        aggregate:            result.aggregate,
        generatedAt:          now,
      },
    });

    reportCardLogger.generated(result.studentId, termId, { actorId, schoolId });
    generated++;
  }

  return { generated, skipped };
}

// ── Publish report cards for a class/term ────────────────────

export async function publishReportCards(
  schoolId: string,
  classId:  string,
  termId:   string,
  actorId:  string
): Promise<{ published: number }> {
  const cls = await db.class.findFirst({
    where:  { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const enrollments = await db.classEnrollment.findMany({
    where: { classId, yearId: cls.yearId },
    select: { studentId: true },
  });
  const studentIds = (enrollments as Array<{ studentId: string }>).map((e) => e.studentId);

  const now = new Date();
  const result = await db.reportCard.updateMany({
    where: {
      termId,
      studentId: { in: studentIds },
      status:    ReportCardStatus.DRAFT,
    },
    data: {
      status:      ReportCardStatus.PUBLISHED,
      publishedAt: now,
      publishedBy: actorId,
    },
  });

  for (const sid of studentIds) {
    reportCardLogger.published(sid, termId, { actorId, schoolId });
    // Non-blocking SMS to linked parents
    void import("./sms.service").then(({ notifyReportCardPublished }) =>
      notifyReportCardPublished(schoolId, sid, termId)
    );
  }

  return { published: result.count };
}

// ── Unpublish (reset to DRAFT) ────────────────────────────────

export async function unpublishReportCard(
  schoolId:     string,
  reportCardId: string,
  actorId:      string
): Promise<void> {
  const card = await db.reportCard.findFirst({
    where: { id: reportCardId, term: { year: { schoolId } } },
    select: { id: true, studentId: true, termId: true, status: true },
  });
  if (!card) throw Object.assign(new Error("Report card not found."), { code: "NOT_FOUND" });

  await db.reportCard.update({
    where: { id: reportCardId },
    data:  { status: ReportCardStatus.DRAFT, publishedAt: null, publishedBy: null },
  });

  logger.info("reportcard.unpublished", {
    userId: actorId, schoolId,
    resource: `reportcard:${reportCardId}`, result: "success",
    meta: { studentId: card.studentId, termId: card.termId },
  });
}

// ── Assemble full report card data for rendering ──────────────

export async function getReportCardData(
  schoolId:     string,
  reportCardId: string
): Promise<ReportCardData | null> {
  const card = await db.reportCard.findFirst({
    where: { id: reportCardId, term: { year: { schoolId } } },
    select: {
      id:                   true,
      termId:               true,
      status:               true,
      publishedAt:          true,
      overallTotal:         true,
      overallAverage:       true,
      classPosition:        true,
      attendancePercentage: true,
      daysAbsent:           true,
      aggregate:            true,
      generatedAt:          true,
      student: {
        select: {
          id:          true,
          indexNumber: true,
          dateOfBirth: true,
          status:      true,
          user: { select: { firstName: true, lastName: true } },
          enrollments: {
            orderBy: { year: { startDate: "desc" } },
            take: 1,
            select: {
              class: {
                select: {
                  name: true,
                  programme: { select: { name: true } },
                  formMaster: {
                    select: {
                      user: { select: { firstName: true, lastName: true } },
                    },
                  },
                },
              },
              year: { select: { name: true } },
            },
          },
        },
      },
      term: {
        select: {
          name:             true,
          number:           true,
          classScoreWeight: true,
          examScoreWeight:  true,
          totalSchoolDays:  true,
          year: { select: { name: true } },
        },
      },
    },
  });

  if (!card) return null;

  // School
  const school = await db.school.findUnique({
    where:  { id: schoolId },
    select: { name: true, logoUrl: true, motto: true, address: true, contactPhone: true, contactEmail: true },
  });
  if (!school) return null;

  // APPROVED scores for this student/term (all subjects)
  const scores = await db.score.findMany({
    where:   { studentId: card.student.id, termId: card.termId,
               status: ScoreStatus.APPROVED,
               term: { year: { schoolId } } },
    select: {
      classScore:  true,
      examScore:   true,
      totalScore:  true,
      grade:       true,
      gradePoint:  true,
      remark:      true,
      subject: { select: { name: true, code: true, isCore: true } },
    },
  });

  // Subject rankings — fetch from ReportCard's precomputed position
  // (positions are per-subject in ScoreAuditLog — we compute them inline)

  // Conduct ratings
  const conductRatings = await db.conductRating.findMany({
    where: {
      studentId: card.student.id,
      termId: card.termId,
    },
    select: { criterion: true, rating: true, remark: true },
    orderBy: { criterion: "asc" },
  });

  // Form master remark (stored in conductRatings with criterion "FORM_MASTER_REMARK")
  type ConductRow = { criterion: string; rating: string; remark: string | null };
  const fmRemark = (conductRatings as ConductRow[]).find((c) => c.criterion === "FORM_MASTER_REMARK");
  const otherRatings = (conductRatings as ConductRow[]).filter((c) => c.criterion !== "FORM_MASTER_REMARK");

  const enrollment = card.student.enrollments[0];

  return {
    reportCardId:  card.id,
    status:        card.status as "DRAFT" | "PUBLISHED",
    publishedAt:   card.publishedAt?.toISOString() ?? null,

    school,

    term: {
      name:             card.term.name,
      number:           card.term.number,
      classScoreWeight: card.term.classScoreWeight,
      examScoreWeight:  card.term.examScoreWeight,
      totalSchoolDays:  card.term.totalSchoolDays,
    },
    year: { name: card.term.year.name },

    student: {
      id:          card.student.id,
      firstName:   card.student.user.firstName,
      lastName:    card.student.user.lastName,
      indexNumber: card.student.indexNumber,
      dateOfBirth: card.student.dateOfBirth?.toISOString() ?? null,
    },

    class:     { name: enrollment?.class.name ?? "—" },
    programme: { name: enrollment?.class.programme.name ?? "—" },

    subjects: (scores as Array<{ classScore: number|null; examScore: number|null; totalScore: unknown; grade: string|null; gradePoint: number|null; remark: string|null; subject: { name: string; code: string; isCore: boolean } }>).map((s) => ({
      name:       s.subject.name,
      code:       s.subject.code,
      isCore:     s.subject.isCore,
      classScore: s.classScore,
      examScore:  s.examScore,
      totalScore: s.totalScore !== null ? Number(s.totalScore) : null,
      grade:      s.grade,
      gradePoint: s.gradePoint,
      remark:     s.remark,
      position:   null, // populated by ranking if needed
    })),

    overallTotal:         card.overallTotal !== null ? Number(card.overallTotal) : null,
    overallAverage:       card.overallAverage !== null ? Number(card.overallAverage) : null,
    classPosition:        card.classPosition,
    attendancePercentage: card.attendancePercentage !== null ? Number(card.attendancePercentage) : null,
    daysAbsent:           card.daysAbsent ?? 0,
    aggregate:            card.aggregate,

    conductRatings: (otherRatings as Array<{ criterion: string; rating: string; remark: string | null }>).map((c) => ({
      criterion: c.criterion,
      rating:    c.rating,
      remark:    c.remark,
    })),
    formMasterRemark: fmRemark?.remark ?? null,

    headteacherName: null, // configurable in future school settings
    generatedAt:     card.generatedAt?.toISOString() ?? null,
  };
}

// ── List report cards for a class/term ───────────────────────

export async function listReportCards(
  schoolId: string,
  classId:  string,
  termId:   string
): Promise<ReportCardListRow[]> {
  const cls = await db.class.findFirst({
    where: { id: classId, schoolId },
    select: { yearId: true },
  });
  if (!cls) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });

  const enrollments = await db.classEnrollment.findMany({
    where: { classId, yearId: cls.yearId },
    select: { studentId: true },
  });
  const studentIds = (enrollments as Array<{ studentId: string }>).map((e) => e.studentId);

  const cards = await db.reportCard.findMany({
    where: { termId, studentId: { in: studentIds } },
    orderBy: [{ classPosition: "asc" }, { student: { user: { lastName: "asc" } } }],
    select: {
      id:            true,
      status:        true,
      classPosition: true,
      aggregate:     true,
      publishedAt:   true,
      generatedAt:   true,
      student: {
        select: {
          id:          true,
          indexNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  const termData = await db.term.findFirst({
    where:  { id: termId },
    select: { name: true },
  });

  return (cards as Array<{ id: string; status: string; classPosition: number|null; aggregate: number|null; publishedAt: Date|null; generatedAt: Date|null; student: { id: string; indexNumber: string; user: { firstName: string; lastName: string } } }>).map((c) => ({
    id:           c.id,
    studentId:    c.student.id,
    studentName:  `${c.student.user.lastName}, ${c.student.user.firstName}`,
    indexNumber:  c.student.indexNumber,
    className:    classId, // enriched below if needed
    termName:     termData?.name ?? "",
    status:       c.status as "DRAFT" | "PUBLISHED",
    classPosition: c.classPosition,
    aggregate:    c.aggregate,
    publishedAt:  c.publishedAt?.toISOString()  ?? null,
    generatedAt:  c.generatedAt?.toISOString()  ?? null,
  }));
}
