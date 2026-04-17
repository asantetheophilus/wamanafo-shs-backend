import { Router } from "express";
import { getSubjectRanking, getClassResultsSummary } from "../services/grading.service";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    const { classId, termId, subjectId } = req.query as Record<string, string>;
    if (!classId || !termId) { res.status(400).json({ success: false, error: "classId and termId required." }); return; }
    if (subjectId) {
      const data = await getSubjectRanking(req.user!.schoolId, classId, subjectId, termId);
      res.json({ success: true, data });
    } else {
      const data = await getClassResultsSummary(req.user!.schoolId, classId, termId);
      res.json({ success: true, data });
    }
  } catch (err) { next(err); }
});
export default router;
