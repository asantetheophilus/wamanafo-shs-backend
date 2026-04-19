import { Router } from "express";
import {
  getScoreGrid,
  upsertScore,
  submitScores,
  approveScore,
  requestAmendment,
  resubmitScore,
  getScoresPendingApproval,
  getScoreAuditLog,
} from "../services/score.service";
import { upsertScoreSchema } from "../validators/score";
import { UserRole } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const { classId, subjectId, termId } = req.query as Record<string, string>;
    if (!classId || !subjectId || !termId) {
      res.status(400).json({ success: false, error: "classId, subjectId and termId are required." });
      return;
    }
    const grid = await getScoreGrid(req.user!.schoolId, classId, subjectId, termId);
    res.json({ success: true, data: grid });
  } catch (err) {
    next(err);
  }
});

router.get("/pending", async (req, res, next) => {
  try {
    const query = req.query as Record<string, string>;
    const mine = ["1", "true", "yes"].includes(String(query.mine ?? "").toLowerCase());

    if (req.user!.role === UserRole.ADMIN) {
      const { classId, termId } = query;
      const result = await getScoresPendingApproval(req.user!.schoolId, classId, termId);
      res.json({ success: true, data: result });
      return;
    }

    if (req.user!.role === UserRole.TEACHER && mine) {
      res.json({ success: true, data: [] });
      return;
    }

    res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const parsed = upsertScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Validation error." });
      return;
    }
    const score = await upsertScore(req.user!.schoolId, req.user!.id, parsed.data);
    res.json({ success: true, data: score });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/audit", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const logs = await getScoreAuditLog(req.user!.schoolId, req.params.id);
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/submit", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const { subjectId, classId, termId } = req.query as Record<string, string>;
    if (!subjectId || !classId || !termId) {
      res.status(400).json({ success: false, error: "subjectId, classId and termId are required." });
      return;
    }
    const result = await submitScores(req.user!.schoolId, req.user!.id, subjectId, classId, termId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/approve", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const score = await approveScore(req.user!.schoolId, req.user!.id, req.params.id);
    res.json({ success: true, data: score });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/amend", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const score = await requestAmendment(req.user!.schoolId, req.user!.id, req.params.id, req.body.reason ?? "");
    res.json({ success: true, data: score });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/resubmit", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }
    const score = await resubmitScore(req.user!.schoolId, req.user!.id, req.params.id);
    res.json({ success: true, data: score });
  } catch (err) {
    next(err);
  }
});

export default router;
