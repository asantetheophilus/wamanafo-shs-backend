import { Router } from "express";
import { db } from "../lib/db";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    const years = await db.academicYear.findMany({
      where: { schoolId: req.user!.schoolId },
      include: { terms: { orderBy: { number: "asc" } } },
      orderBy: { startDate: "desc" },
    });
    res.json({ success: true, data: { items: years, total: years.length } });
  } catch (err) { next(err); }
});
export default router;
