import { Router } from "express";
import { db } from "../lib/db";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    const { classId, termId, studentId } = req.query as Record<string, string>;
    const ratings = await db.conductRating.findMany({
      where: { termId, ...(studentId ? { studentId } : {}) },
      orderBy: [{ student: { user: { lastName: "asc" } } }, { criterion: "asc" }],
    });
    res.json({ success: true, data: ratings });
  } catch (err) { next(err); }
});
router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const { bulk, remark: isRemark } = req.query as Record<string, string>;
    if (bulk === "true") {
      const { termId, classId, entries } = req.body;
      let saved = 0;
      for (const entry of entries as any[]) {
        await db.conductRating.upsert({
          where: { studentId_termId_criterion: { studentId: entry.studentId, termId, criterion: entry.criterion } },
          create: { studentId: entry.studentId, termId, criterion: entry.criterion, rating: entry.rating, remark: entry.remark ?? null, ratedBy: req.user!.id },
          update: { rating: entry.rating, remark: entry.remark ?? null, ratedBy: req.user!.id },
        });
        saved++;
      }
      res.json({ success: true, data: { saved } });
    } else {
      const { studentId, termId, criterion, rating, remark } = req.body;
      const r = await db.conductRating.upsert({
        where: { studentId_termId_criterion: { studentId, termId, criterion } },
        create: { studentId, termId, criterion, rating, remark: remark ?? null, ratedBy: req.user!.id },
        update: { rating, remark: remark ?? null, ratedBy: req.user!.id },
      });
      res.status(201).json({ success: true, data: r });
    }
  } catch (err) { next(err); }
});
export default router;
