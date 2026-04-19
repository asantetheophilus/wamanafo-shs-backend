import { Router } from "express";
import { listClasses, getClass, createClass, updateClass, getClassEnrollments } from "../services/class.service";
import { createClassSchema, updateClassSchema, classQuerySchema } from "../validators/class";
import { UserRole } from "../lib/enums";
import { db } from "../lib/db";

const router = Router();

async function getTeacherClassIds(userId: string): Promise<Set<string>> {
  const teacher = await db.teacher.findUnique({ where: { userId }, select: { id: true } });
  if (!teacher) return new Set();

  const [assignments, formMasterClasses] = await Promise.all([
    db.teachingAssignment.findMany({ where: { teacherId: teacher.id }, select: { classId: true } }),
    db.class.findMany({ where: { formMasterId: teacher.id }, select: { id: true } }),
  ]);

  return new Set([...assignments.map((a) => a.classId), ...formMasterClasses.map((c) => c.id)]);
}

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.TEACHER) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const parsed = classQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid query parameters." });
      return;
    }

    const result = await listClasses(req.user!.schoolId, parsed.data);

    if (req.user!.role === UserRole.ADMIN) {
      res.json({ success: true, data: result });
      return;
    }

    const allowedClassIds = await getTeacherClassIds(req.user!.id);
    const items = result.items.filter((row) => allowedClassIds.has(row.id));
    res.json({ success: true, data: { items, total: items.length } });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.TEACHER) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    if (req.user!.role === UserRole.TEACHER) {
      const allowedClassIds = await getTeacherClassIds(req.user!.id);
      if (!allowedClassIds.has(req.params.id)) {
        res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
        return;
      }
    }

    const cls = await getClass(req.user!.schoolId, req.params.id);
    if (!cls) {
      res.status(404).json({ success: false, error: "Class not found.", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: cls });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/enrollments", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.TEACHER) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    if (req.user!.role === UserRole.TEACHER) {
      const allowedClassIds = await getTeacherClassIds(req.user!.id);
      if (!allowedClassIds.has(req.params.id)) {
        res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
        return;
      }
    }

    const { yearId } = req.query as Record<string, string>;
    if (!yearId) {
      res.status(400).json({ success: false, error: "yearId is required." });
      return;
    }

    const enrollments = await getClassEnrollments(req.user!.schoolId, req.params.id, yearId);
    res.json({ success: true, data: enrollments });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const parsed = createClassSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }
    const cls = await createClass(req.user!.schoolId, req.user!.id, parsed.data);
    res.status(201).json({ success: true, data: cls });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const parsed = updateClassSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }
    const cls = await updateClass(req.user!.schoolId, req.params.id, req.user!.id, parsed.data);
    res.json({ success: true, data: cls });
  } catch (err) {
    next(err);
  }
});

export default router;
