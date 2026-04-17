import { Router } from "express";
import { computeClassResults } from "../services/grading.service";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    const { classId, termId, studentId } = req.query as Record<string, string>;
    if (!classId || !termId) { res.status(400).json({ success: false, error: "classId and termId required." }); return; }
    const results = await computeClassResults(req.user!.schoolId, classId, termId, true);
    const out = studentId ? results.find((r) => r.studentId === studentId) ?? null : results;
    res.json({ success: true, data: out });
  } catch (err) { next(err); }
});
router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const { classId, termId } = req.query as Record<string, string>;
    const results = await computeClassResults(req.user!.schoolId, classId!, termId!, true);
    res.json({ success: true, data: { recomputed: results.length } });
  } catch (err) { next(err); }
});
export default router;
