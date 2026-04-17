import { Router } from "express";
import { computePromotionRecommendations, DEFAULT_PROMOTION_CRITERIA } from "../services/promotion.service";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const { classId, termId, minCore, minElective, minAttendance, minAverage } = req.query as Record<string, string>;
    const criteria = {
      minCoreSubjectPasses: Number(minCore ?? DEFAULT_PROMOTION_CRITERIA.minCoreSubjectPasses),
      minElectivePasses: Number(minElective ?? DEFAULT_PROMOTION_CRITERIA.minElectivePasses),
      minAttendancePercent: Number(minAttendance ?? DEFAULT_PROMOTION_CRITERIA.minAttendancePercent),
      minOverallAverage: Number(minAverage ?? DEFAULT_PROMOTION_CRITERIA.minOverallAverage),
    };
    const results = await computePromotionRecommendations(req.user!.schoolId, classId!, termId!, criteria);
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});
export default router;
