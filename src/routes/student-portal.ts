import { Router } from "express";
import { db } from "../lib/db";
import { UserRole, ScoreStatus, ReportCardStatus, AttendanceStatus } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.STUDENT) {
      res.status(403).json({ success: false, error: "Forbidden." });
      return;
    }

    const student = await db.student.findFirst({
      where: { userId: req.user!.id, schoolId: req.user!.schoolId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        enrollments: {
          take: 1,
          orderBy: { year: { startDate: "desc" } },
          include: { class: { include: { programme: true } }, year: true },
        },
      },
    });

    if (!student) {
      res.status(404).json({ success: false, error: "Student not found." });
      return;
    }

    const view = String(req.query.view ?? "overview");
    const activeEnrollment = student.enrollments[0] ?? null;

    const terms = await db.term.findMany({
      where: { year: { schoolId: req.user!.schoolId } },
      orderBy: [{ year: { startDate: "desc" } }, { number: "asc" }],
      include: { year: { select: { id: true, name: true } } },
    });

    const now = new Date();
    const currentTerm =
      terms.find((t) => t.startDate && t.endDate && t.startDate <= now && t.endDate >= now) ??
      terms[0] ??
      null;

    if (view === "overview") {
      const publishedReportCards = await db.reportCard.count({
        where: { studentId: student.id, status: ReportCardStatus.PUBLISHED },
      });

      res.json({
        success: true,
        data: {
          student: {
            id: student.id,
            indexNumber: student.indexNumber,
            user: {
              firstName: student.user.firstName,
              lastName: student.user.lastName,
            },
          },
          currentClass: activeEnrollment?.class.name ?? null,
          currentProgramme: activeEnrollment?.class.programme.name ?? null,
          currentYear: activeEnrollment?.year.name ?? null,
          currentTerm: currentTerm?.name ?? null,
          publishedReportCards,
        },
      });
      return;
    }

    const selectedTermId = typeof req.query.termId === "string" && req.query.termId ? req.query.termId : currentTerm?.id;

    if (view === "scores") {
      const scores = selectedTermId
        ? await db.score.findMany({
            where: {
              studentId: student.id,
              termId: selectedTermId,
              status: ScoreStatus.APPROVED,
            },
            orderBy: { subject: { name: "asc" } },
            include: {
              subject: { select: { name: true, code: true, isCore: true } },
            },
          })
        : [];

      res.json({
        success: true,
        data: scores.map((s) => ({
          subject: s.subject,
          classScore: s.classScore,
          examScore: s.examScore,
          totalScore: s.totalScore == null ? null : Number(s.totalScore),
          grade: s.grade,
          gradePoint: s.gradePoint,
          remark: s.remark,
        })),
      });
      return;
    }

    if (view === "attendance") {
      if (!selectedTermId) {
        res.json({
          success: true,
          data: {
            presentCount: 0,
            lateCount: 0,
            absentCount: 0,
            excusedCount: 0,
            attendancePercentage: null,
            daysAbsent: 0,
            totalSchoolDays: 0,
          },
        });
        return;
      }

      const [records, term] = await Promise.all([
        db.attendanceRecord.findMany({
          where: { studentId: student.id, termId: selectedTermId },
          select: { status: true },
        }),
        db.term.findUnique({ where: { id: selectedTermId }, select: { totalSchoolDays: true } }),
      ]);

      const presentCount = records.filter((r) => r.status === AttendanceStatus.PRESENT).length;
      const lateCount = records.filter((r) => r.status === AttendanceStatus.LATE).length;
      const absentCount = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
      const excusedCount = records.filter((r) => r.status === AttendanceStatus.EXCUSED).length;
      const totalMarked = records.length;
      const attendancePercentage = totalMarked > 0 ? Number((((presentCount + lateCount) / totalMarked) * 100).toFixed(2)) : null;

      res.json({
        success: true,
        data: {
          presentCount,
          lateCount,
          absentCount,
          excusedCount,
          attendancePercentage,
          daysAbsent: absentCount,
          totalSchoolDays: term?.totalSchoolDays ?? totalMarked,
        },
      });
      return;
    }

    if (view === "report-cards") {
      const reportCards = await db.reportCard.findMany({
        where: { studentId: student.id, status: ReportCardStatus.PUBLISHED },
        orderBy: [{ term: { year: { startDate: "desc" } } }, { term: { number: "asc" } }],
        include: {
          term: { include: { year: { select: { name: true } } } },
        },
      });

      res.json({
        success: true,
        data: reportCards.map((card) => ({
          id: card.id,
          termName: card.term.name,
          yearName: card.term.year.name,
          classPosition: card.classPosition,
          aggregate: card.aggregate,
          publishedAt: card.publishedAt?.toISOString() ?? null,
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
