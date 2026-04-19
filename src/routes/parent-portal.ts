import { Router } from "express";
import { db } from "../lib/db";
import { UserRole, ReportCardStatus, ScoreStatus, AttendanceStatus } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.PARENT) {
      res.status(403).json({ success: false, error: "Forbidden." });
      return;
    }

    const parent = await db.parent.findFirst({
      where: { userId: req.user!.id, schoolId: req.user!.schoolId },
      include: {
        studentLinks: {
          include: {
            student: {
              include: {
                user: { select: { firstName: true, lastName: true } },
                enrollments: {
                  take: 1,
                  orderBy: { year: { startDate: "desc" } },
                  include: { class: { include: { programme: true } }, year: true },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      res.status(404).json({ success: false, error: "Parent not found." });
      return;
    }

    const view = String(req.query.view ?? "children");

    if (view === "children") {
      res.json({
        success: true,
        data: parent.studentLinks.map((link) => {
          const enrollment = link.student.enrollments[0] ?? null;
          return {
            studentId: link.student.id,
            firstName: link.student.user.firstName,
            lastName: link.student.user.lastName,
            indexNumber: link.student.indexNumber,
            status: link.student.status,
            relation: link.relation,
            className: enrollment?.class.name ?? null,
            yearName: enrollment?.year.name ?? null,
          };
        }),
      });
      return;
    }

    const studentId = String(req.query.studentId ?? "");
    const link = parent.studentLinks.find((item) => item.student.id === studentId);
    if (!link) {
      res.status(404).json({ success: false, error: "Linked student not found." });
      return;
    }

    const now = new Date();
    const terms = await db.term.findMany({
      where: { year: { schoolId: req.user!.schoolId } },
      orderBy: [{ year: { startDate: "desc" } }, { number: "asc" }],
      include: { year: { select: { id: true, name: true } } },
    });
    const currentTerm =
      terms.find((t) => t.startDate && t.endDate && t.startDate <= now && t.endDate >= now) ??
      terms[0] ??
      null;
    const selectedTermId = typeof req.query.termId === "string" && req.query.termId ? req.query.termId : currentTerm?.id;
    const enrollment = link.student.enrollments[0] ?? null;

    if (view === "overview") {
      const publishedReportCards = await db.reportCard.count({
        where: { studentId: studentId, status: ReportCardStatus.PUBLISHED },
      });
      res.json({
        success: true,
        data: {
          student: {
            id: link.student.id,
            firstName: link.student.user.firstName,
            lastName: link.student.user.lastName,
            indexNumber: link.student.indexNumber,
            status: link.student.status,
          },
          relation: link.relation,
          currentClass: enrollment?.class.name ?? null,
          currentProgramme: enrollment?.class.programme.name ?? null,
          currentYear: enrollment?.year.name ?? null,
          currentTerm: currentTerm?.name ?? null,
          publishedReportCards,
        },
      });
      return;
    }

    if (view === "report-cards") {
      const reportCards = await db.reportCard.findMany({
        where: { studentId, status: ReportCardStatus.PUBLISHED },
        orderBy: [{ term: { year: { startDate: "desc" } } }, { term: { number: "asc" } }],
        include: { term: { include: { year: { select: { name: true } } } } },
      });
      res.json({
        success: true,
        data: reportCards.map((card) => ({
          id: card.id,
          termName: card.term.name,
          yearName: card.term.year.name,
          classPosition: card.classPosition,
          overallAverage: card.overallAverage == null ? null : Number(card.overallAverage),
          aggregate: card.aggregate,
          publishedAt: card.publishedAt?.toISOString() ?? null,
        })),
      });
      return;
    }

    if (view === "attendance") {
      if (!selectedTermId) {
        res.json({ success: true, data: [] });
        return;
      }
      const [records, term] = await Promise.all([
        db.attendanceRecord.findMany({ where: { studentId, termId: selectedTermId }, select: { status: true } }),
        db.term.findUnique({ where: { id: selectedTermId }, select: { id: true, name: true, number: true, totalSchoolDays: true } }),
      ]);
      const presentCount = records.filter((r) => r.status === AttendanceStatus.PRESENT).length;
      const lateCount = records.filter((r) => r.status === AttendanceStatus.LATE).length;
      const absentCount = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
      const attendancePercentage = records.length > 0 ? Number((((presentCount + lateCount) / records.length) * 100).toFixed(2)) : null;
      res.json({
        success: true,
        data: term
          ? [{
              termName: term.name,
              termNumber: term.number,
              presentCount,
              lateCount,
              absentCount,
              attendancePercentage,
              daysAbsent: absentCount,
            }]
          : [],
      });
      return;
    }

    if (view === "scores") {
      if (!selectedTermId) {
        res.json({ success: true, data: [] });
        return;
      }
      const scores = await db.score.findMany({
        where: { studentId, termId: selectedTermId, status: ScoreStatus.APPROVED },
        orderBy: { subject: { name: "asc" } },
        include: { subject: true, term: { include: { year: { select: { name: true } } } } },
      });
      res.json({
        success: true,
        data: scores.map((s) => ({
          subjectName: s.subject.name,
          subjectCode: s.subject.code,
          isCore: s.subject.isCore,
          termName: s.term.name,
          yearName: s.term.year.name,
          totalScore: s.totalScore == null ? null : Number(s.totalScore),
          grade: s.grade,
          gradePoint: s.gradePoint,
          remark: s.remark,
        })),
      });
      return;
    }

    res.status(400).json({ success: false, error: "Invalid view." });
  } catch (err) {
    next(err);
  }
});

export default router;
