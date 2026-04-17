import { Router } from "express";
import { db } from "../lib/db";
import { UserRole } from "../lib/enums";
const router = Router();
router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.STUDENT) { res.status(403).json({ success: false, error: "Forbidden." }); return; }
    const student = await db.student.findFirst({
      where: { userId: req.user!.id, schoolId: req.user!.schoolId },
      select: { id: true, indexNumber: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) { res.status(404).json({ success: false, error: "Student not found." }); return; }
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
});
export default router;
