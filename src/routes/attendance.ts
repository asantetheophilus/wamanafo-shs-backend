import { Router } from "express";
import { getAttendanceGrid, bulkMarkAttendance, getAttendanceSummaries } from "../services/attendance.service";
import { UserRole } from "../lib/enums";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const { classId, termId, date } = req.query as Record<string, string>;
    if (!classId || !termId || !date) {
      res.status(400).json({ success: false, error: "classId, termId, date required." });
      return;
    }
    const grid = await getAttendanceGrid(req.user!.schoolId, classId, termId, date);
    res.json({ success: true, data: grid });
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
    const result = await bulkMarkAttendance(req.user!.schoolId, req.user!.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.TEACHER && req.user!.role !== UserRole.ADMIN) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    const { classId, termId } = req.query as Record<string, string>;
    const summaries = await getAttendanceSummaries(req.user!.schoolId, classId!, termId!);
    res.json({ success: true, data: summaries });
  } catch (err) {
    next(err);
  }
});

export default router;
