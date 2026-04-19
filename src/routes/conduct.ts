import { Router } from "express";
import { db } from "../lib/db";
import { UserRole } from "../lib/enums";

const router = Router();

async function assertClassAndTermScope(schoolId: string, classId: string, termId: string) {
  const [klass, term] = await Promise.all([
    db.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, yearId: true, formMaster: { select: { userId: true } } } }),
    db.term.findFirst({ where: { id: termId, year: { schoolId } }, select: { id: true, yearId: true } }),
  ]);

  if (!klass) throw Object.assign(new Error("Class not found."), { code: "NOT_FOUND" });
  if (!term) throw Object.assign(new Error("Term not found."), { code: "NOT_FOUND" });
  if (klass.yearId !== term.yearId) {
    throw Object.assign(new Error("Class and term are from different academic years."), { code: "VALIDATION_ERROR" });
  }

  return { klass, term };
}

async function assertTeacherCanRate(userId: string, classId: string, termId: string): Promise<void> {
  const teacher = await db.teacher.findUnique({ where: { userId }, select: { id: true } });
  if (!teacher) throw Object.assign(new Error("Teacher profile not found."), { code: "NOT_FOUND" });

  const [isFormMaster, hasAssignment] = await Promise.all([
    db.class.findFirst({ where: { id: classId, formMasterId: teacher.id }, select: { id: true } }),
    db.teachingAssignment.findFirst({ where: { teacherId: teacher.id, classId, termId }, select: { id: true } }),
  ]);

  if (!isFormMaster && !hasAssignment) {
    throw Object.assign(new Error("You are not authorized to rate conduct for this class."), { code: "FORBIDDEN" });
  }
}

async function getClassStudentIds(classId: string, yearId: string): Promise<Set<string>> {
  const enrollments = await db.classEnrollment.findMany({
    where: { classId, yearId },
    select: { studentId: true },
  });

  return new Set(enrollments.map((e) => e.studentId));
}

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const { classId, termId } = req.query as Record<string, string>;
    if (!classId || !termId) {
      res.status(400).json({ success: false, error: "classId and termId are required.", code: "VALIDATION_ERROR" });
      return;
    }

    const { klass } = await assertClassAndTermScope(req.user!.schoolId, classId, termId);

    if (req.user!.role === UserRole.TEACHER) {
      await assertTeacherCanRate(req.user!.id, classId, termId);
    }

    const studentIds = await getClassStudentIds(classId, klass.yearId);
    if (studentIds.size === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const ratings = await db.conductRating.findMany({
      where: { termId, studentId: { in: [...studentIds] } },
      orderBy: [{ student: { user: { lastName: "asc" } } }, { criterion: "asc" }],
    });

    res.json({ success: true, data: ratings });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const { bulk } = req.query as Record<string, string>;

    if (bulk === "true") {
      const { termId, classId, entries } = req.body as {
        termId: string;
        classId: string;
        entries: Array<{ studentId: string; criterion: string; rating: string; remark?: string }>;
      };

      if (!termId || !classId || !Array.isArray(entries) || entries.length === 0) {
        res.status(400).json({ success: false, error: "termId, classId and entries are required.", code: "VALIDATION_ERROR" });
        return;
      }

      const { klass } = await assertClassAndTermScope(req.user!.schoolId, classId, termId);

      if (req.user!.role === UserRole.TEACHER) {
        await assertTeacherCanRate(req.user!.id, classId, termId);
      }

      const allowedStudentIds = await getClassStudentIds(classId, klass.yearId);

      let saved = 0;
      for (const entry of entries) {
        if (!allowedStudentIds.has(entry.studentId)) {
          continue;
        }

        await db.conductRating.upsert({
          where: {
            studentId_termId_criterion: {
              studentId: entry.studentId,
              termId,
              criterion: entry.criterion,
            },
          },
          create: {
            studentId: entry.studentId,
            termId,
            criterion: entry.criterion,
            rating: entry.rating,
            remark: entry.remark ?? null,
            ratedBy: req.user!.id,
          },
          update: {
            rating: entry.rating,
            remark: entry.remark ?? null,
            ratedBy: req.user!.id,
          },
        });
        saved++;
      }

      res.json({ success: true, data: { saved } });
      return;
    }

    const { studentId, termId, classId, criterion, rating, remark } = req.body as {
      studentId: string;
      termId: string;
      classId: string;
      criterion: string;
      rating: string;
      remark?: string;
    };

    if (!studentId || !termId || !classId || !criterion || !rating) {
      res.status(400).json({ success: false, error: "studentId, classId, termId, criterion and rating are required.", code: "VALIDATION_ERROR" });
      return;
    }

    const { klass } = await assertClassAndTermScope(req.user!.schoolId, classId, termId);

    if (req.user!.role === UserRole.TEACHER) {
      await assertTeacherCanRate(req.user!.id, classId, termId);
    }

    const allowedStudentIds = await getClassStudentIds(classId, klass.yearId);
    if (!allowedStudentIds.has(studentId)) {
      res.status(403).json({ success: false, error: "Student is not enrolled in this class.", code: "FORBIDDEN" });
      return;
    }

    const saved = await db.conductRating.upsert({
      where: { studentId_termId_criterion: { studentId, termId, criterion } },
      create: { studentId, termId, criterion, rating, remark: remark ?? null, ratedBy: req.user!.id },
      update: { rating, remark: remark ?? null, ratedBy: req.user!.id },
    });

    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    next(err);
  }
});

export default router;
