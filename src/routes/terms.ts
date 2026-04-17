import { Router } from "express";
import { db } from "../lib/db";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    const terms = await db.term.findMany({
      where: { year: { schoolId: req.user!.schoolId } },
      include: { year: { select: { id: true, name: true } } },
      orderBy: [{ year: { startDate: "desc" } }, { number: "asc" }],
    });
    res.json({ success: true, data: { items: terms, total: terms.length } });
  } catch (err) { next(err); }
});
router.patch("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const existing = await db.term.findFirst({ where: { id: req.params.id, year: { schoolId: req.user!.schoolId } } });
    if (!existing) { res.status(404).json({ success: false, error: "Term not found." }); return; }
    const { classScoreWeight, examScoreWeight, totalSchoolDays, startDate, endDate } = req.body;
    if (classScoreWeight !== undefined && examScoreWeight !== undefined && classScoreWeight + examScoreWeight !== 100) {
      res.status(400).json({ success: false, error: "Weights must sum to 100." }); return;
    }
    const updated = await db.term.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});
export default router;
