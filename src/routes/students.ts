import { Router } from "express";
import { listStudents, getStudent, createStudent, updateStudent, enrollStudent } from "../services/student.service";
import { createStudentSchema, updateStudentSchema, studentQuerySchema } from "../validators/student";
import { UserRole } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const parsed = studentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid query parameters." }); return;
    }
    const result = await listStudents(req.user!.schoolId, parsed.data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const student = await getStudent(req.user!.schoolId, req.params.id);
    if (!student) { res.status(404).json({ success: false, error: "Student not found.", code: "NOT_FOUND" }); return; }
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" }); return;
    }
    const parsed = createStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." }); return;
    }
    const student = await createStudent(req.user!.schoolId, req.user!.id, parsed.data as Parameters<typeof createStudent>[2]);
    res.status(201).json({ success: true, data: student });
  } catch (err) { next(err); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" }); return;
    }
    const parsed = updateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." }); return;
    }
    const student = await updateStudent(req.user!.schoolId, req.params.id, req.user!.id, parsed.data);
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
});

router.post("/:id/enroll", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" }); return;
    }
    const { classId, yearId } = req.body as { classId: string; yearId: string };
    if (!classId || !yearId) {
      res.status(400).json({ success: false, error: "classId and yearId are required." }); return;
    }
    const result = await enrollStudent(req.user!.schoolId, req.params.id, classId, yearId, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
