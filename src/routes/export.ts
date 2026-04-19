// ============================================================
// Wamanafo SHS - Export Routes
// GET /api/v1/export/attendance (Teacher/Admin)
// GET /api/v1/export/scores (Teacher/Admin)
// ============================================================

import { Router } from "express";
import { UserRole } from "../lib/enums";
import { exportAttendance, exportScores, ExportFormat } from "../services/export.service";
import { db } from "../lib/db";

const router = Router();

function resolveFormat(raw?: string): ExportFormat {
  return raw === "csv" ? "csv" : "xlsx";
}

router.get("/attendance", async (req, res, next) => {
  try {
    const role = req.user!.role;
    if (role !== UserRole.ADMIN && role !== UserRole.TEACHER) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    let teacherId: string | undefined;
    if (role === UserRole.TEACHER) {
      const teacher = await db.teacher.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!teacher) {
        res.status(404).json({ success: false, error: "Teacher profile not found." });
        return;
      }
      teacherId = teacher.id;
    } else if (typeof req.query.teacherId === "string" && req.query.teacherId) {
      teacherId = req.query.teacherId;
    }

    const format = resolveFormat(req.query.format as string);
    const { buffer, filename, contentType } = await exportAttendance(
      req.user!.schoolId,
      teacherId,
      {
        classId: req.query.classId as string | undefined,
        termId: req.query.termId as string | undefined,
        studentId: req.query.studentId as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      },
      format,
      role === UserRole.ADMIN
    );

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.get("/scores", async (req, res, next) => {
  try {
    const role = req.user!.role;
    if (role !== UserRole.ADMIN && role !== UserRole.TEACHER) {
      res.status(403).json({ success: false, error: "Forbidden.", code: "FORBIDDEN" });
      return;
    }

    let teacherId: string | undefined;
    if (role === UserRole.TEACHER) {
      const teacher = await db.teacher.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
      if (!teacher) {
        res.status(404).json({ success: false, error: "Teacher profile not found." });
        return;
      }
      teacherId = teacher.id;
    } else if (typeof req.query.teacherId === "string" && req.query.teacherId) {
      teacherId = req.query.teacherId;
    }

    const format = resolveFormat(req.query.format as string);
    const { buffer, filename, contentType } = await exportScores(
      req.user!.schoolId,
      teacherId,
      {
        classId: req.query.classId as string | undefined,
        subjectId: req.query.subjectId as string | undefined,
        termId: req.query.termId as string | undefined,
        studentId: req.query.studentId as string | undefined,
      },
      format,
      role === UserRole.ADMIN
    );

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
