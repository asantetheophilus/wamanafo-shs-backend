import { Router } from "express";
import { getDashboardStats } from "../services/analytics.service";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const stats = await getDashboardStats(req.user!.schoolId);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});
export default router;
