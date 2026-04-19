import { Router } from "express";
import { listSubjects, getSubject, createSubject, updateSubject } from "../services/subject.service";
import { createSubjectSchema, updateSubjectSchema, subjectQuerySchema } from "../validators/subject";
import { UserRole } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.TEACHER) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const parsed = subjectQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid query parameters." });
      return;
    }
    const result = await listSubjects(req.user!.schoolId, parsed.data);
    res.json({ success: true, data: result });
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

    const subject = await getSubject(req.user!.schoolId, req.params.id);
    if (!subject) {
      res.status(404).json({ success: false, error: "Subject not found.", code: "NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: subject });
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
    const parsed = createSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }
    const subject = await createSubject(req.user!.schoolId, req.user!.id, parsed.data);
    res.status(201).json({ success: true, data: subject });
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
    const parsed = updateSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }
    const subject = await updateSubject(req.user!.schoolId, req.params.id, req.user!.id, parsed.data);
    res.json({ success: true, data: subject });
  } catch (err) {
    next(err);
  }
});

export default router;
