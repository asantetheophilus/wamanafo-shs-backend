import { Router } from "express";
import { listTeachers, getTeacher, createTeacher, updateTeacher, deactivateTeacher } from "../services/teacher.service";
import { createTeacherSchema, updateTeacherSchema, teacherQuerySchema } from "../validators/teacher";
import { UserRole } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const parsed = teacherQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid query parameters." });
      return;
    }
    const result = await listTeachers(req.user!.schoolId, parsed.data);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const teacher = await getTeacher(req.user!.schoolId, req.params.id);
    if (!teacher) {
      res.status(404).json({ success: false, error: "Teacher not found.", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: teacher });
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
    const parsed = createTeacherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }
    const teacher = await createTeacher(req.user!.schoolId, req.user!.id, parsed.data);
    res.status(201).json({ success: true, data: teacher });
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
    const parsed = updateTeacherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }
    const teacher = await updateTeacher(req.user!.schoolId, req.params.id, req.user!.id, parsed.data);
    res.json({ success: true, data: teacher });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    await deactivateTeacher(req.user!.schoolId, req.params.id, req.user!.id);
    res.json({ success: true, data: null, message: "Teacher deactivated." });
  } catch (err) {
    next(err);
  }
});

export default router;
