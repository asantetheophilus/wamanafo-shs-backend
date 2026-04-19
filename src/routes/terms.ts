import { Router } from "express";
import { db } from "../lib/db";
import { UserRole } from "../lib/enums";
import { parseFlexibleDateInput } from "../lib/date-input";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const terms = await db.term.findMany({
      where: { year: { schoolId: req.user!.schoolId } },
      include: { year: { select: { id: true, name: true } } },
      orderBy: [{ year: { startDate: "desc" } }, { number: "asc" }],
    });
    const currentOnly = ["1", "true", "yes"].includes(String(req.query.current ?? "").toLowerCase());
    const now = new Date();
    const withFlags = terms.map((term) => ({
      ...term,
      isCurrent: !!(term.startDate && term.endDate && term.startDate <= now && term.endDate >= now),
    }));
    const items = currentOnly ? withFlags.filter((term) => term.isCurrent) : withFlags;
    res.json({ success: true, data: { items, total: items.length } });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden." });
      return;
    }

    const existing = await db.term.findFirst({
      where: { id: req.params.id, year: { schoolId: req.user!.schoolId } },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: "Term not found." });
      return;
    }

    const classScoreWeight = req.body.classScoreWeight !== undefined ? Number(req.body.classScoreWeight) : undefined;
    const examScoreWeight = req.body.examScoreWeight !== undefined ? Number(req.body.examScoreWeight) : undefined;
    const totalSchoolDays = req.body.totalSchoolDays !== undefined ? Number(req.body.totalSchoolDays) : undefined;

    const nextClassWeight = classScoreWeight ?? existing.classScoreWeight;
    const nextExamWeight = examScoreWeight ?? existing.examScoreWeight;

    if (nextClassWeight + nextExamWeight !== 100) {
      res.status(400).json({ success: false, error: "Weights must sum to 100." });
      return;
    }

    const startDate = parseFlexibleDateInput(req.body.startDate, { endOfDay: false });
    const endDate = parseFlexibleDateInput(req.body.endDate, { endOfDay: true });

    if (startDate === null) {
      res.status(400).json({ success: false, error: "Start date must be a valid date." });
      return;
    }
    if (endDate === null) {
      res.status(400).json({ success: false, error: "End date must be a valid date." });
      return;
    }

    const nextStart = startDate === undefined ? existing.startDate : startDate;
    const nextEnd = endDate === undefined ? existing.endDate : endDate;
    if (nextStart && nextEnd && nextEnd <= nextStart) {
      res.status(400).json({ success: false, error: "End date must be after start date." });
      return;
    }

    const updated = await db.term.update({
      where: { id: req.params.id },
      data: {
        ...(totalSchoolDays !== undefined ? { totalSchoolDays } : {}),
        ...(classScoreWeight !== undefined ? { classScoreWeight } : {}),
        ...(examScoreWeight !== undefined ? { examScoreWeight } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
